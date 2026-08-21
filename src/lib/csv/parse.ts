import Papa from "papaparse";

import { decodeCsvBuffer, type DetectedEncoding } from "./decode";
import { detectDelimiter, type Delimiter } from "./delimiter";

export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type ParsedCsv = {
  headers: string[];
  /** Data rows, header excluded. Index 0 is spreadsheet row 2. */
  rows: string[][];
  encoding: DetectedEncoding;
  delimiter: Delimiter;
  /** Rows whose column count differs from the header — usually a quoting bug. */
  raggedRows: number[];
  truncated: boolean;
};

export type ParseFailure = { ok: false; error: "empty" | "tooLarge" | "noHeader" | "tooManyRows" };
export type ParseSuccess = { ok: true; data: ParsedCsv };

/**
 * Parses an uploaded CSV.
 *
 * Encoding and delimiter are resolved before Papaparse sees the text, because
 * its own auto-detection mis-reads the `;`-delimited Windows-1252 files that
 * Excel produces on a German locale — the single most common shape of file this
 * product will be handed.
 *
 * Parsing happens synchronously on a decoded string rather than in a worker.
 * At the 20,000-row ceiling that is a few hundred milliseconds on the main
 * thread, which is a fair trade for not having to marshal a File into a worker
 * after decoding it by hand. If the ceiling is ever raised, revisit this.
 */
export function parseCsv(buffer: ArrayBuffer, filename: string): ParseSuccess | ParseFailure {
  if (buffer.byteLength === 0) return { ok: false, error: "empty" };
  if (buffer.byteLength > MAX_IMPORT_BYTES) return { ok: false, error: "tooLarge" };

  const { text, encoding } = decodeCsvBuffer(buffer);
  if (text.trim() === "") return { ok: false, error: "empty" };

  const delimiter = detectDelimiter(
    text.slice(0, 64 * 1024),
    filename.endsWith(".tsv") ? "\t" : ",",
  );

  /*
   * The blank-header check has to run on the raw text, before Papaparse.
   *
   * `skipEmptyLines: "greedy"` discards a line containing only delimiters, so a
   * file starting `;;;` had that row removed and the first *data* row silently
   * promoted to the header — consuming one contact and filling the mapping UI
   * with a person's name as column titles. The post-parse check that was
   * supposed to catch this could never fire, because every row Papaparse
   * returned had at least one non-empty cell by construction.
   *
   * Splitting on newlines is not a full CSV parse and does not need to be: a
   * quoted field spanning lines always has content on its first line, so it can
   * never look all-delimiter here.
   *
   * A line counts as the header candidate if it *contains the delimiter* or has
   * any content. The delimiter clause is what makes this work for a TSV: a line
   * of only tabs is whitespace as far as `trim()` is concerned, so testing
   * content alone would skip it as blank and promote the data row after it —
   * exactly the bug being fixed. Genuinely blank leading lines, including ones
   * padded with spaces, are still skipped harmlessly.
   */
  const headerLine = text
    .split(/\r?\n/)
    .find((line) => line.includes(delimiter) || line.trim() !== "");

  if (headerLine === undefined || headerLine.split(delimiter).every((c) => c.trim() === "")) {
    return { ok: false, error: "noHeader" };
  }

  const result = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: "greedy",
    // Everything stays a string: Papaparse's dynamic typing would turn a
    // postcode of "01067" into the number 1067 and a phone number into
    // scientific notation.
    dynamicTyping: false,
  });

  const allRows = (result.data ?? []).filter((row) => Array.isArray(row) && row.length > 0);
  if (allRows.length === 0) return { ok: false, error: "empty" };

  // The all-blank case is already handled above, on the raw text. This only
  // narrows the type — `allRows.length > 0` guarantees a first element, but
  // `noUncheckedIndexedAccess` does not know that.
  const [headerRow, ...dataRows] = allRows;
  if (!headerRow) return { ok: false, error: "noHeader" };

  if (dataRows.length > MAX_IMPORT_ROWS) return { ok: false, error: "tooManyRows" };

  const headers = headerRow.map((cell, index) => {
    const trimmed = (cell ?? "").trim();
    // An unnamed column still needs a stable label for the mapping UI.
    return trimmed === "" ? `Column ${index + 1}` : trimmed;
  });

  // A row with the wrong column count is nearly always an unbalanced quote.
  // Surfaced rather than dropped, so the user sees which line to fix.
  const raggedRows: number[] = [];
  dataRows.forEach((row, index) => {
    if (row.length !== headers.length) raggedRows.push(index + 2);
  });

  return {
    ok: true,
    data: {
      headers,
      rows: dataRows.map((row) => row.map((cell) => cell ?? "")),
      encoding,
      delimiter,
      raggedRows: raggedRows.slice(0, 100),
      truncated: false,
    },
  };
}
