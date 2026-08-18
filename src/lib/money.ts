/**
 * Money handling.
 *
 * Amounts are stored as `bigint` cents in Postgres and carried as `number`
 * cents in the app. Never as a float in a major unit — 0.1 + 0.2 pricing bugs
 * in a sales tool destroy trust faster than almost any other defect.
 *
 * Formatting is deliberately *not* done here. The currency symbol, grouping and
 * decimal separator depend on the viewer's locale and the organization's
 * currency, so rendering belongs to next-intl's formatter at the edge.
 */

/** Converts integer cents into the major unit for a currency formatter. */
export function centsToMajorUnit(cents: number): number {
  return cents / 100;
}

/** Rounds a major-unit amount to integer cents for storage. */
export function majorUnitToCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Parses a typed or pasted amount into integer cents.
 *
 * Accepts both grammars, because the file's locale has nothing to do with the
 * user's interface language — a German spreadsheet gets imported by an
 * English-speaking admin all the time:
 *
 *     "1.234,56 €"  ->  123456      (de-DE)
 *     "$1,234.56"   ->  123456      (en-US)
 *     "1234"        ->  123400
 *     "1 234,5"     ->  123450      (narrow no-break space from Excel)
 *
 * The rule for telling them apart: whichever separator appears **last** is the
 * decimal one. That is what distinguishes `1.234,56` from `1,234.56`. When only
 * one separator appears it is ambiguous — `1.234` could be 1234 or 1.234 — so
 * the tie-break is the group-of-three test: exactly three digits after it means
 * a thousands separator, anything else means a decimal point. `1.234` is one
 * thousand two hundred thirty-four; `1.23` is one euro twenty-three.
 *
 * Returns null for anything unparseable rather than guessing zero — silently
 * turning a typo into a €0 deal is worse than refusing the input.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  if (typeof input !== "string") return null;

  // Currency codes go first, while the spaces that delimit them still exist.
  // Stripping spaces first turns "EUR 1.234,56" into "EUR1.234,56", where the
  // \b boundary between "R" and "1" does not exist, so the code survives and
  // fails the numeric check below.
  let value = input
    .replace(/(?:^|\s)(?:EUR|USD|GBP|CHF)(?=\s|$|[\d(+-])/gi, " ")
    .replace(/[€$£¥]/g, "")
    // \s covers NBSP and the narrow no-break space Excel uses for grouping.
    .replace(/\s/g, "")
    .trim();

  if (value === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    // Accounting notation: (1.234,56) is negative.
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.startsWith("-")) {
    negative = true;
    value = value.slice(1);
  }
  if (value.startsWith("+")) value = value.slice(1);

  if (!/^[0-9.,]+$/.test(value)) return null;
  // Adjacent or edge separators are malformed, not something to interpret.
  // Without this, "1..2" parses happily as 1.20.
  if (/[.,]{2,}/.test(value) || /^[.,]|[.,]$/.test(value)) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  let decimalSeparator: "," | "." | null = null;

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the later one is the decimal separator.
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma !== -1 || lastDot !== -1) {
    const separator = lastComma !== -1 ? "," : ".";
    const index = lastComma !== -1 ? lastComma : lastDot;
    const trailing = value.length - index - 1;
    const occurrences = value.split(separator).length - 1;

    // A single separator with exactly three digits after it, and no other
    // separator, is a thousands group: "1.234" is 1234, not 1.234.
    //
    // Except when the integer part is just zero. Nobody writes "0,005" meaning
    // five — that is five thousandths, and the group-of-three rule has to yield
    // to the fact that a thousands group never has a leading-zero head.
    const head = value.slice(0, index);
    const looksLikeThousands =
      trailing === 3 && occurrences === 1 && index > 0 && !/^0+$/.test(head);
    decimalSeparator = looksLikeThousands ? null : separator;
  }

  let integerPart: string;
  let fractionPart = "";

  if (decimalSeparator) {
    const index = value.lastIndexOf(decimalSeparator);
    integerPart = value.slice(0, index).replace(/[.,]/g, "");
    fractionPart = value.slice(index + 1).replace(/[.,]/g, "");
  } else {
    integerPart = value.replace(/[.,]/g, "");
  }

  if (integerPart === "" && fractionPart === "") return null;
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionPart)) return null;

  // Round rather than truncate at more than two decimals: 1,005 -> 101 cents.
  const cents =
    Number(integerPart || "0") * 100 + Math.round(Number(`0.${fractionPart || "0"}`) * 100);

  if (!Number.isFinite(cents) || cents > Number.MAX_SAFE_INTEGER) return null;

  return negative ? -cents : cents;
}

/** Cents to an editable string in the major unit, for populating a form. */
export function centsToInput(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  if (cents === 0) return "";
  return (cents / 100).toFixed(2);
}
