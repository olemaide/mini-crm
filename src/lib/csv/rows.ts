import { normalizeDomain, normalizeEmail, normalizeName, normalizeText } from "@/lib/normalize";
import { splitFullName, type ImportField } from "./headers";

/** One row, mapped to fields and normalised, ready to send to the import RPC. */
export type PreparedRow = {
  row: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  notes: string | null;
  company_name: string | null;
  company_domain: string | null;
  /** Set when the row cannot be imported. The RPC records it as an error. */
  _error?: string;
};

export type PrepareResult = {
  rows: PreparedRow[];
  validCount: number;
  errorCount: number;
  /** Rows dropped because an earlier row in the same file had the same email. */
  inFileDuplicates: number;
};

/**
 * Maps, normalises and validates every row of a parsed file.
 *
 * Runs on the whole file at preview time so the counts shown to the user are
 * the real ones, not an estimate from the first 20 rows.
 *
 * Two behaviours worth stating outright:
 *
 *   - Invalid rows are **kept and marked**, never silently dropped. A user who
 *     imports 500 rows and gets 487 contacts deserves to know which 13 failed
 *     and why.
 *   - Duplicates *within the file* are detected here rather than in the
 *     database. The importer sends chunks, so the second copy of an address
 *     might land in a different request; catching it client-side is the only
 *     place with a view of the whole file.
 *
 * Phone numbers are deliberately NOT normalised here — that needs the
 * organization's country and libphonenumber's metadata, so it happens in the
 * chunk endpoint instead. See /api/import/chunk.
 */
export function prepareRows(
  dataRows: string[][],
  mapping: Record<number, ImportField | null>,
): PrepareResult {
  const prepared: PreparedRow[] = [];
  const seenEmails = new Set<string>();
  let errorCount = 0;
  let inFileDuplicates = 0;

  dataRows.forEach((cells, index) => {
    // +2: spreadsheets are 1-indexed and row 1 is the header, so the first data
    // row is row 2. Users reconcile errors against what Excel shows them.
    const rowNumber = index + 2;

    const values: Partial<Record<ImportField, string>> = {};
    for (const [columnIndex, field] of Object.entries(mapping)) {
      if (!field) continue;
      const raw = cells[Number(columnIndex)];
      if (typeof raw === "string" && raw.trim() !== "") values[field] = raw;
    }

    let firstName = normalizeName(values.first_name ?? null);
    let lastName = normalizeName(values.last_name ?? null);

    if (!firstName && !lastName && values.full_name) {
      const split = splitFullName(values.full_name);
      firstName = normalizeName(split.firstName);
      lastName = normalizeName(split.lastName);
    }

    const rawEmail = values.email ?? null;
    const email = normalizeEmail(rawEmail);

    const base: PreparedRow = {
      row: rowNumber,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: normalizeText(values.phone ?? null, 50),
      job_title: normalizeText(values.job_title ?? null, 150),
      linkedin_url: normalizeText(values.linkedin_url ?? null, 500),
      notes: normalizeText(values.notes ?? null, 10_000),
      company_name: normalizeText(values.company_name ?? null, 200),
      company_domain: normalizeDomain(values.company_domain ?? null),
    };

    // An email that was present but unparseable is a real error, not an absence.
    if (rawEmail && rawEmail.trim() !== "" && !email) {
      errorCount += 1;
      prepared.push({ ...base, _error: "invalidEmail" });
      return;
    }

    if (!firstName && !lastName && !email) {
      errorCount += 1;
      prepared.push({ ...base, _error: "missingIdentity" });
      return;
    }

    if (email) {
      if (seenEmails.has(email)) {
        inFileDuplicates += 1;
        errorCount += 1;
        prepared.push({ ...base, _error: "duplicateInFile" });
        return;
      }
      seenEmails.add(email);
    }

    prepared.push(base);
  });

  return {
    rows: prepared,
    validCount: prepared.length - errorCount,
    errorCount,
    inFileDuplicates,
  };
}

/** Splits prepared rows into request-sized chunks. */
export function chunkRows<T>(rows: T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

/** Builds the downloadable error report. */
export function buildErrorCsv(
  errors: { row: number; code: string; message: string }[],
  headers: { row: string; problem: string; detail: string },
): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [[headers.row, headers.problem, headers.detail].map(escape).join(",")];

  for (const error of errors) {
    lines.push([String(error.row), error.code, error.message].map(escape).join(","));
  }

  // BOM so Excel opens the report as UTF-8 instead of mangling the umlauts in
  // the very error messages the user needs to read.
  return `﻿${lines.join("\r\n")}`;
}
