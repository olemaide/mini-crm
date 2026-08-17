/**
 * Normalises an email address to the canonical form stored in the database.
 *
 * The `contacts.email` column is `citext` with a CHECK that the value is
 * trimmed, so anything this returns must already satisfy both.
 *
 * Deliberately *not* done: stripping Gmail dots or `+tag` suffixes. Those are
 * provider-specific rules, they are wrong for most other hosts, and a CRM that
 * silently merges `anna+crm@` into `anna@` loses information the user put there
 * on purpose. Fuzzy matching belongs in Phase 3's dedupe review, not here.
 */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;

  let value = input.trim();
  if (value === "") return null;

  // Spreadsheets and mail clients love to paste these in.
  value = value.replace(/^mailto:/i, "").trim();

  // Excel exports sometimes wrap addresses in angle brackets: <a@b.com>
  const bracketed = /^<(.+)>$/.exec(value);
  if (bracketed?.[1]) value = bracketed[1].trim();

  // "Anna Schmidt <anna@firma.de>" -> "anna@firma.de"
  const withDisplayName = /<([^<>@\s]+@[^<>@\s]+)>\s*$/.exec(value);
  if (withDisplayName?.[1]) value = withDisplayName[1].trim();

  value = value.toLowerCase();

  // Matches the CHECK constraint on contacts.email. Intentionally permissive:
  // rejecting valid-but-unusual addresses loses real customer data, and the
  // authoritative test of an address is whether mail to it is delivered.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return null;

  return value;
}
