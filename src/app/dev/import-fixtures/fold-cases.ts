import { foldForSearch } from "@/lib/search/fold";

/**
 * `foldForSearch` must agree with Postgres's `search_key()`, character for
 * character.
 *
 * Every expected value below was **recorded from the database**, not written
 * from memory:
 *
 *   select ch, public.search_key(ch) from unnest(array[...]) as ch;
 *
 * That matters because the failure is silent. The stored columns are folded by
 * Postgres; the needle is folded here. If the two rules drift, searching
 * `Größler` simply returns nothing — no error, no warning, just a search box
 * that quietly stops finding a name that is definitely in the database.
 *
 * The interesting rows are the ones with no Unicode decomposition at all —
 * ß, æ, ø, þ, ł, đ, ð — where NFD stripping does nothing and only the explicit
 * expansion table saves it.
 */
export const FOLD_CASES: { input: string; expected: string; why: string }[] = [
  // ---- German
  { input: "ä", expected: "a", why: "umlaut" },
  { input: "ö", expected: "o", why: "umlaut" },
  { input: "ü", expected: "u", why: "umlaut" },
  { input: "Ä", expected: "a", why: "capital umlaut folds and lowercases" },
  { input: "ß", expected: "ss", why: "no decomposition — expands to two letters" },
  { input: "ẞ", expected: "ss", why: "capital sharp s" },
  { input: "Größler", expected: "grossler", why: "the case a naive NFD fold gets wrong" },
  { input: "Weißbach", expected: "weissbach", why: "same, mid-word" },
  { input: "Käsehof", expected: "kasehof", why: "umlaut in a company name" },
  { input: "Ångström", expected: "angstrom", why: "ring above plus umlaut" },

  // ---- Nordic
  { input: "ø", expected: "o", why: "stroke, not a combining mark" },
  { input: "Ø", expected: "o", why: "capital stroke" },
  { input: "æ", expected: "ae", why: "ligature expands" },
  { input: "Æ", expected: "ae", why: "capital ligature" },
  { input: "å", expected: "a", why: "ring above decomposes normally" },
  { input: "Sørensen", expected: "sorensen", why: "the acceptance criterion's surname" },
  { input: "Ærø", expected: "aero", why: "ligature and stroke in one word" },
  { input: "þ", expected: "th", why: "thorn expands to two letters" },
  { input: "ð", expected: "d", why: "eth" },

  // ---- French, Spanish, Portuguese
  { input: "é", expected: "e", why: "acute" },
  { input: "è", expected: "e", why: "grave" },
  { input: "ê", expected: "e", why: "circumflex" },
  { input: "ë", expected: "e", why: "diaeresis" },
  { input: "ç", expected: "c", why: "cedilla" },
  { input: "ñ", expected: "n", why: "tilde" },
  { input: "ã", expected: "a", why: "tilde" },
  { input: "œ", expected: "oe", why: "ligature expands" },
  { input: "Céline", expected: "celine", why: "given name" },
  { input: "Zoë", expected: "zoe", why: "diaeresis at the end" },

  // ---- Central European, Turkish
  { input: "ł", expected: "l", why: "stroke, no decomposition" },
  { input: "đ", expected: "d", why: "stroke, no decomposition" },
  { input: "ž", expected: "z", why: "caron" },
  { input: "š", expected: "s", why: "caron" },
  { input: "č", expected: "c", why: "caron" },
  { input: "ů", expected: "u", why: "ring above" },
  { input: "ą", expected: "a", why: "ogonek" },
  { input: "ż", expected: "z", why: "dot above" },
  { input: "ı", expected: "i", why: "dotless i" },
  { input: "ğ", expected: "g", why: "breve" },
  { input: "ş", expected: "s", why: "cedilla" },
  {
    input: "İstanbul",
    expected: "istanbul",
    why: "capital dotted I lowercases to i + dot, then strips",
  },

  // ---- plumbing
  { input: "  Anna  ", expected: "anna", why: "trimmed" },
  { input: "ANNA MÜLLER", expected: "anna muller", why: "lower-cased, spacing preserved" },
  { input: "", expected: "", why: "empty stays empty" },
  { input: "person42@firma7.example", expected: "person42@firma7.example", why: "ASCII untouched" },
];

export function runFoldCase(input: string): string {
  return foldForSearch(input);
}
