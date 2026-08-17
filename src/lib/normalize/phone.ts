import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalises a phone number to E.164 (`+493012345678`).
 *
 * `defaultCountry` comes from the organization's country so a German user can
 * type "030 12345678" and get the right result. Without it, any national-format
 * number is unparseable.
 *
 * Unparseable input is **kept, not discarded**. A CRM full of extensions,
 * "call via reception", and half-typed numbers is normal; throwing that away to
 * satisfy a format is worse than storing it verbatim. Phase 3's dedupe tier 2
 * only matches on values that did normalise, which is the correct behaviour —
 * two unparseable strings are not evidence of a duplicate.
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
    if (parsed?.isValid()) return parsed.number;
  } catch {
    // libphonenumber throws on some malformed input rather than returning
    // undefined; either way the fallback below is what we want.
  }

  // Preserve what the user typed, within the column's length limit.
  return value.slice(0, 50);
}
