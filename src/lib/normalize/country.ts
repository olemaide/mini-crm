import type { CountryCode } from "libphonenumber-js";

/**
 * The organization's country, for national-format phone parsing.
 *
 * Timezone is the only country-ish signal an organization carries today, so it
 * stands in until an explicit country field exists. That makes this a guess, and
 * a deliberately conservative one: getting it wrong turns "030 12345678" into a
 * number in the wrong country, so anything unrecognised falls back to DE — the
 * target market — rather than to whatever the browser suggests.
 *
 * Extracted in Phase 9. This function existed verbatim in three places —
 * `contacts/actions.ts`, `companies/actions.ts` and the import chunk route — and
 * convention 14 says every write path normalises identically. Three copies of
 * the rule is three chances for one of them to fall behind, which is exactly how
 * a contact typed by hand stops being byte-identical to one imported from a CSV.
 */
export function countryForOrg(timezone: string): CountryCode {
  if (timezone === "Europe/Vienna") return "AT";
  if (timezone === "Europe/Zurich") return "CH";
  if (timezone === "Europe/London") return "GB";
  return "DE";
}
