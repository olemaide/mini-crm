/**
 * Expected results for parseMoneyToCents.
 *
 * Deferred from Phase 3 — contacts have no numeric fields — and due now that
 * deal values exist. Same reasoning as the CSV fixtures: a pure function with
 * many edge cases where a silent failure turns a €12,500 deal into €12.50 and
 * quietly corrupts the forecast.
 *
 * The hard case is the single separator. `1.234` is ambiguous in isolation:
 * German reads 1234, English reads 1.234. The rule is a group-of-three test —
 * exactly three digits after a lone separator means thousands.
 */
export const MONEY_CASES: { input: string; expected: number | null; why: string }[] = [
  // ---- unambiguous: both separators present, later one is the decimal
  { input: "1.234,56", expected: 123456, why: "de-DE" },
  { input: "1,234.56", expected: 123456, why: "en-US" },
  { input: "1.234.567,89", expected: 123456789, why: "de-DE, multiple groups" },
  { input: "1,234,567.89", expected: 123456789, why: "en-US, multiple groups" },

  // ---- single separator, group-of-three test
  { input: "1.234", expected: 123400, why: "lone separator + 3 digits = thousands" },
  { input: "1,234", expected: 123400, why: "same rule, comma" },
  { input: "1.23", expected: 123, why: "2 digits after = decimal" },
  { input: "1,5", expected: 150, why: "1 digit after = decimal" },
  { input: "0,99", expected: 99, why: "under one unit" },

  // ---- no separator
  { input: "12500", expected: 1250000, why: "plain integer" },
  { input: "0", expected: 0, why: "zero" },

  // ---- currency symbols, codes and Excel's assorted spaces
  { input: "1.234,56 €", expected: 123456, why: "trailing euro sign" },
  { input: "$1,234.56", expected: 123456, why: "leading dollar sign" },
  { input: "EUR 1.234,56", expected: 123456, why: "currency code" },
  { input: "1 234,56", expected: 123456, why: "non-breaking space as group separator" },
  { input: "  12500  ", expected: 1250000, why: "surrounding whitespace" },

  // ---- signs
  { input: "-1.234,56", expected: -123456, why: "negative" },
  { input: "(1.234,56)", expected: -123456, why: "accounting parentheses" },
  { input: "+500", expected: 50000, why: "explicit plus" },

  // ---- rounding beyond two decimals
  // 1,005 IS a thousands group by the rule — one thousand and five, 100500
  // cents. The first version of this case expected 100, which was simply wrong.
  { input: "1,005", expected: 100500, why: "3 digits after a lone separator = thousands" },
  // …but a zero head cannot be a thousands group, so this is five thousandths.
  { input: "0,005", expected: 1, why: "zero head overrides the rule; rounds to one cent" },
  { input: "1.2345", expected: 123, why: "4 decimals round to cents" },

  // ---- refused rather than guessed
  { input: "", expected: null, why: "empty" },
  { input: "abc", expected: null, why: "not a number" },
  { input: "12,50 EUR extra", expected: null, why: "trailing text" },
  { input: "1..2", expected: null, why: "malformed" },
];
