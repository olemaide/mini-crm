/**
 * The TypeScript twin of Postgres's `search_key()`.
 *
 * Both the list search box and ⌘K compare a typed needle against the stored,
 * folded `search_name` / `search_email` columns. Those columns were generated
 * by `search_key()` in SQL, so a needle folded by a *different* rule silently
 * stops matching — typing `Größler` would find nothing because the column holds
 * `grossler` while a naive JavaScript fold produces `größler`.
 *
 * Unicode NFD decomposition gets most of the way there, but it cannot help with
 * characters that carry no combining mark and expand to several letters: `ß`,
 * `æ`, `ø`, `þ` and friends have no decomposition at all. Those are listed
 * explicitly below, transcribed from what Postgres's unaccent dictionary
 * actually returns rather than from memory — see the fixtures, which compare
 * this function against that recorded output.
 */
const EXPANSIONS: Record<string, string> = {
  ß: "ss",
  ẞ: "ss",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  þ: "th",
  Þ: "th",
  ø: "o",
  Ø: "o",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  ı: "i",
};

const EXPANSION_RE = new RegExp(`[${Object.keys(EXPANSIONS).join("")}]`, "gu");

export function foldForSearch(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(EXPANSION_RE, (char) => EXPANSIONS[char] ?? char)
      // Everything else is a base letter plus combining marks once decomposed,
      // so stripping the marks is the whole job.
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
  );
}
