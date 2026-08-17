/**
 * Reduces anything a user might paste into a bare domain.
 *
 *   https://www.Firma.de/impressum?x=1  ->  firma.de
 *   anna@firma.de                       ->  firma.de
 *   FIRMA.DE.                           ->  firma.de
 *
 * The bare form is what makes domain a useful dedupe key and what lets CSV
 * import auto-link a contact to its company. Must satisfy the CHECK constraint
 * on `companies.domain`; anything that does not is returned as null rather than
 * stored in a half-cleaned state.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;

  let value = input.trim().toLowerCase();
  if (value === "") return null;

  // Someone pasted an email address into the domain field.
  const atIndex = value.lastIndexOf("@");
  if (atIndex !== -1) value = value.slice(atIndex + 1);

  value = value
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // any scheme, not just http(s)
    .replace(/^www\./, "")
    .split("/")[0]!
    .split("?")[0]!
    .split("#")[0]!
    .split(":")[0]! // strip a port
    .replace(/\.$/, ""); // trailing dot on a fully-qualified name

  if (value === "") return null;

  // Mirrors the CHECK on companies.domain. Note this rejects internationalised
  // domains in Unicode form; punycode (xn--…) passes, which is the correct
  // canonical representation anyway.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) {
    return null;
  }

  return value;
}

/** Keeps a full URL but guarantees it has a scheme, so links are clickable. */
export function normalizeWebsite(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;

  const value = input.trim();
  if (value === "") return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;

  try {
    // Round-tripping through URL validates it and normalises the host casing.
    return new URL(withScheme).toString().slice(0, 500);
  } catch {
    return null;
  }
}
