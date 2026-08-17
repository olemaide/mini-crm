/**
 * Trims and collapses internal whitespace. Returns null for empty input so the
 * column stores NULL rather than an empty string — `''` and `NULL` looking
 * different in queries is a recurring source of "why is this contact missing".
 */
export function normalizeText(input: string | null | undefined, maxLength?: number): string | null {
  if (typeof input !== "string") return null;

  const value = input.trim().replace(/\s+/g, " ");
  if (value === "") return null;

  return maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Normalises a person's name.
 *
 * Case is corrected **only** when the input is entirely uppercase — the usual
 * signature of a spreadsheet export. Anything else is left exactly as typed.
 *
 * That restraint is deliberate. Automatic title-casing mangles the names people
 * actually have: `von der Leyen`, `McDonald`, `de Boer`, `O'Brien`, `bell hooks`.
 * Getting someone's name wrong in a tool their salesperson reads aloud is worse
 * than leaving an occasional lowercase entry alone.
 */
export function normalizeName(input: string | null | undefined, maxLength = 100): string | null {
  const value = normalizeText(input, maxLength);
  if (value === null) return null;

  const hasLetters = /\p{L}/u.test(value);
  const isAllCaps = hasLetters && value === value.toUpperCase();
  if (!isAllCaps) return value;

  // ALL CAPS -> Title Case, hyphen- and apostrophe-aware so
  // "ANNA-LENA O'BRIEN" becomes "Anna-Lena O'Brien".
  return value
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_match, boundary: string, letter: string) => {
      return boundary + letter.toLocaleUpperCase();
    });
}
