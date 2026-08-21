import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Longest value the `contacts.phone` CHECK constraint accepts. */
const MAX_PHONE_LENGTH = 50;

/**
 * Normalises a phone number to E.164, keeping any extension.
 *
 *   "030 12345678"            ->  "+493012345678"
 *   "030 12345678 ext. 42"    ->  "+493012345678;ext=42"
 *   "call via reception"      ->  "call via reception"   (kept verbatim)
 *
 * `defaultCountry` comes from the organization's country so a German user can
 * type "030 12345678" and get the right result. Without it, any national-format
 * number is unparseable.
 *
 * Unparseable input is **kept, not discarded**. A CRM full of "call via
 * reception" and half-typed numbers is normal; throwing that away to satisfy a
 * format is worse than storing it verbatim. Phase 3's dedupe tier 2 only matches
 * on values that did normalise, which is the correct behaviour — two unparseable
 * strings are not evidence of a duplicate.
 *
 * The output is rendered into a `tel:` href on the contact and company pages.
 * `tel:+493012345678;ext=42` is valid RFC 3966, so a dialer handles the
 * extension rather than choking on it — which is the other reason for this
 * spelling over prose.
 *
 * ---
 *
 * **The extension suffix is load-bearing, and it is a fix (Phase 9).**
 *
 * This function used to return `parsed.number`, which is E.164 and by definition
 * carries no extension — so "030 12345678 ext. 42" was stored as
 * "+493012345678" and the 42 was gone. Silent data loss: nobody could reach that
 * person from the CRM again, and the digits were never written anywhere to
 * recover them from.
 *
 * It also made dedupe tier 2 noisier than it needed to be. That tier matches on
 * the exact normalised phone, so stripped extensions collapsed every colleague
 * behind one switchboard onto a single value. Tier 2 is *advisory only* and the
 * import matches on email alone, so this never skipped a contact — but it did
 * inflate the "possible duplicates" count with people who merely share a
 * reception desk, which is precisely the case `preview_import_duplicates` calls
 * out as legitimate.
 *
 * The suffix is the RFC 3966 `;ext=` form rather than prose like " ext. 42",
 * because it has to survive being compared for equality: prose varies with the
 * source file ("x42", "ext 42", "Durchwahl 42") and would make two records of
 * the same person look different. RFC 3966 is also what `libphonenumber`'s own
 * formatter emits, so there is one canonical spelling.
 *
 * Two consequences worth knowing:
 *
 *   1. Contacts stored **before** this fix have their extension already gone,
 *      and it cannot be recovered — the digits were never written. Re-importing
 *      the original file is the only way back.
 *   2. `+493012345678` and `+493012345678;ext=42` are now different values, so
 *      dedupe treats them as different people. That is the intended behaviour
 *      and the whole point, but it does mean re-importing a file that previously
 *      collapsed onto one contact will now create the rest of them.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = "DE",
): string | null {
  if (typeof input !== "string") return null;

  const value = input.trim();
  if (value === "") return null;

  try {
    const parsed = parsePhoneNumberFromString(value, defaultCountry);
    if (parsed?.isValid()) {
      // `ext` is only ever digits, so it needs no escaping. Guarded anyway
      // because it lands in a value that is later compared for equality.
      const extension = parsed.ext?.replace(/\D/g, "") ?? "";
      const normalized = extension === "" ? parsed.number : `${parsed.number};ext=${extension}`;

      /*
       * A backstop against the column CHECK, and believed unreachable: E.164
       * caps at 16 characters, `;ext=` adds 5, and libphonenumber will not
       * accept an extension long enough to make up the remaining 29. It stays
       * because the alternative failure is a constraint violation mid-import,
       * and because dropping the extension is the only safe way to shorten this
       * — truncating E.164 mid-digits would produce a plausible-looking *wrong*
       * number, which is worse than losing the extension.
       */
      return normalized.length <= MAX_PHONE_LENGTH ? normalized : parsed.number;
    }
  } catch {
    // libphonenumber throws on some malformed input rather than returning
    // undefined; either way the fallback below is what we want.
  }

  // Preserve what the user typed, within the column's length limit.
  return value.slice(0, MAX_PHONE_LENGTH);
}
