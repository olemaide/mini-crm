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
 * Vitest is deferred (build plan §1.4), so Phase 3 adds a fixture harness at
 * /dev/import-fixtures instead. If one testing tool is reinstated early, point
 * it here first.
 */

export { normalizeEmail } from "./email";
export { normalizePhone } from "./phone";
export { normalizeDomain, normalizeWebsite } from "./domain";
export { normalizeName, normalizeText } from "./name";
