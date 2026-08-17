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
