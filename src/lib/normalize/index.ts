/**
 * Input normalisers.
 *
 * Pure functions, shared by manual entry (Phase 2) and CSV import (Phase 3).
 * Every value that can arrive from a human or a spreadsheet passes through
 * here before it reaches the database, so "  Anna@Firma.DE " and
 * "anna@firma.de" cannot both exist as separate contacts.
 *
 * These are exactly the functions unit tests exist for — pure input→output with
 * many edge cases, where a silent failure corrupts customer data permanently.
 * Vitest was deferred (build plan §1.4) and reinstated in Phase 9, pointed here
 * first as that section said it should be. The fixture harness at
 * /dev/import-fixtures remains, sharing its case tables with the suite.
 */

export { normalizeEmail } from "./email";
export { normalizePhone } from "./phone";
export { countryForOrg } from "./country";
export { normalizeDomain, normalizeWebsite } from "./domain";
export { normalizeName, normalizeText } from "./name";
