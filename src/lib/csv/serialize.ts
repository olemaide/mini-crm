/**
 * Object rows to a CSV string.
 *
 * Hand-rolled rather than papaparse's `unparse`, matching `buildErrorCsv` in
 * ./rows.ts — the escaping rule is four lines and importing a parser to emit
 * three commas is not a trade worth making on the server.
 *
 * Two details that look cosmetic and are not:
 *
 *   * The header is the union of every row's keys, not the first row's. Postgres
 *     omits nothing, but a row shaped by `to_jsonb` can legitimately differ
 *     between records, and taking the first row's keys silently truncates the
 *     rest — the failure mode where a customer's export is missing a column
 *     nobody notices until they try to import it somewhere else.
 *   * A leading `=`, `+`, `-` or `@` is prefixed with an apostrophe. Excel treats
 *     those as formulas, so a contact whose note begins `=cmd|…` becomes a CSV
 *     injection against whoever opens the export. The apostrophe is the standard
 *     defusal and Excel does not display it.
 */

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Nested jsonb (an activity's metadata, an import job's error list) round-trips
  // as JSON rather than as "[object Object]".
  return JSON.stringify(value);
}

function escapeCell(raw: string): string {
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const lines = [columns.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(serializeValue(row[column]))).join(","));
  }

  // BOM, so Excel opens it as UTF-8 instead of mangling every umlaut.
  return `﻿${lines.join("\r\n")}`;
}
