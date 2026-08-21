import type { DetectedEncoding, Delimiter, ImportField } from "@/lib/csv";

/**
 * What each fixture must produce.
 *
 * This file is the substitute for unit tests on the CSV pipeline (build plan
 * §1.4 — Vitest is deferred). The functions it exercises are exactly the ones
 * unit tests exist for: pure input→output, many edge cases, and a silent
 * failure corrupts a customer's contact database permanently.
 *
 * If Vitest is ever reinstated, these expectations port over almost verbatim.
 */
export type FixtureExpectation = {
  file: string;
  /**
   * Directory relative to the repo root. Defaults to the fixture corpus; the
   * downloadable templates live in `public/` and are checked here too, because
   * a template is a promise to the user about what the importer accepts.
   *
   * A literal union rather than `string`, deliberately. The harness resolves it
   * to a hard-coded path so Turbopack can see the filesystem access is scoped to
   * a known subfolder — with a free-form string it traced the *entire project*
   * into the deployed server bundle. Adding a third root has to be a conscious
   * edit in both places, which is the point.
   */
  dir?: "public";
  /** Why this file exists — shown in the harness so a failure is legible. */
  purpose: string;
  encoding: DetectedEncoding;
  delimiter: Delimiter;
  headerCount: number;
  dataRowCount: number;
  /** Fields the mapping must detect from the headers alone. */
  mustMap: ImportField[];
  validRows: number;
  errorRows: number;
  inFileDuplicates?: number;
  /** Spot checks on individual prepared rows, keyed by spreadsheet row number. */
  cells?: {
    row: number;
    field: "first_name" | "last_name" | "email" | "company_name" | "company_domain";
    value: string | null;
  }[];
};

export const FIXTURES: FixtureExpectation[] = [
  {
    file: "utf8-comma.csv",
    purpose: "Baseline: UTF-8, comma-delimited, English headers.",
    encoding: "utf-8",
    delimiter: ",",
    headerCount: 7,
    dataRowCount: 3,
    mustMap: [
      "first_name",
      "last_name",
      "email",
      "phone",
      "job_title",
      "company_name",
      "company_domain",
    ],
    validRows: 3,
    errorRows: 0,
    cells: [
      { row: 2, field: "email", value: "anna@firma-a.example" },
      { row: 4, field: "company_domain", value: "firma-b.example" },
    ],
  },
  {
    file: "latin1-semicolon.csv",
    purpose:
      "The file Excel produces on a German Windows machine: Windows-1252, semicolons, German headers, umlauts. Half of the DACH market's exports look like this.",
    encoding: "windows-1252",
    delimiter: ";",
    headerCount: 6,
    dataRowCount: 3,
    mustMap: ["first_name", "last_name", "email", "phone", "job_title", "company_name"],
    validRows: 3,
    errorRows: 0,
    cells: [
      // Proves the encoding fallback fired: as UTF-8 this decodes to "MÃ¼ller".
      { row: 2, field: "last_name", value: "Müller" },
      { row: 3, field: "first_name", value: "Björn" },
      { row: 4, field: "last_name", value: "Weiß" },
      { row: 2, field: "company_name", value: "Müller & Söhne GmbH" },
    ],
  },
  {
    file: "utf8-bom-tab.csv",
    purpose:
      'The "Save as CSV UTF-8" shape: byte-order mark plus tabs. An unstripped BOM makes the first header unmatchable.',
    encoding: "utf-8-bom",
    delimiter: "\t",
    headerCount: 4,
    dataRowCount: 2,
    // first_name would not map if the BOM were still glued to "First Name".
    mustMap: ["first_name", "last_name", "email", "company_name"],
    validRows: 2,
    errorRows: 0,
    cells: [{ row: 3, field: "last_name", value: "Müller" }],
  },
  {
    file: "dupes-within-file.csv",
    purpose:
      "The same address three times, varying by case and surrounding whitespace. Chunked upload means the copies can land in different requests, so this must be caught before sending.",
    encoding: "utf-8",
    delimiter: ",",
    headerCount: 3,
    dataRowCount: 5,
    mustMap: ["first_name", "last_name", "email"],
    validRows: 3,
    errorRows: 2,
    inFileDuplicates: 2,
  },
  {
    file: "quoted-separators.csv",
    purpose:
      "Delimiters, quotes and newlines inside quoted fields. A delimiter detector that is not quote-aware picks the comma here and shreds every row.",
    encoding: "utf-8",
    delimiter: ";",
    headerCount: 4,
    dataRowCount: 3,
    mustMap: ["first_name", "last_name", "company_name", "notes"],
    validRows: 3,
    errorRows: 0,
    cells: [
      { row: 2, field: "last_name", value: "Schmidt, Anna" },
      { row: 2, field: "company_name", value: "Müller, Meier & Co. KG" },
      { row: 3, field: "company_name", value: "Fischer; Söhne GmbH" },
    ],
  },
  {
    file: "missing-identity.csv",
    purpose:
      "Rows with nothing to identify a person by, and an unparseable address. Both must be reported, never silently dropped.",
    encoding: "utf-8",
    delimiter: ",",
    headerCount: 4,
    dataRowCount: 5,
    mustMap: ["first_name", "last_name", "email", "notes"],
    validRows: 3,
    errorRows: 2,
  },
  {
    file: "full-name-split.csv",
    purpose:
      "A single Name column, plus an ALL CAPS row. The name splitter and the caps-only title-casing both apply here.",
    encoding: "utf-8",
    delimiter: ",",
    headerCount: 4,
    dataRowCount: 4,
    mustMap: ["full_name", "email", "phone", "company_name"],
    validRows: 4,
    errorRows: 0,
    cells: [
      // ALL CAPS is corrected; mixed case would be left alone.
      { row: 2, field: "first_name", value: "Anna" },
      { row: 2, field: "last_name", value: "Schmidt" },
      // Middle names stay with the given name.
      { row: 4, field: "first_name", value: "Carla Maria" },
      { row: 4, field: "last_name", value: "Weber" },
      // A single-token name is a first name, not a surname.
      { row: 5, field: "first_name", value: "Cher" },
      { row: 5, field: "last_name", value: null },
    ],
  },

  // ---- the downloadable templates ----
  // Checked with the same rigour as the fixtures. If someone edits a header and
  // breaks auto-mapping, the file we hand users would quietly stop working.
  {
    file: "mini-crm-contacts-template.csv",
    dir: "public",
    purpose:
      "The English template offered in the wizard. Comma-delimited for English Excel, BOM so umlauts survive. Every column must auto-map with no manual work.",
    encoding: "utf-8-bom",
    delimiter: ",",
    headerCount: 9,
    dataRowCount: 4,
    mustMap: [
      "first_name",
      "last_name",
      "email",
      "phone",
      "job_title",
      "company_name",
      "company_domain",
      "linkedin_url",
      "notes",
    ],
    validRows: 4,
    errorRows: 0,
    cells: [
      { row: 2, field: "last_name", value: "Müller" },
      { row: 4, field: "last_name", value: "Weiß" },
      // The freelancer row demonstrates that a contact needs no company.
      { row: 5, field: "company_name", value: null },
    ],
  },
  {
    file: "mini-crm-kontakte-vorlage.csv",
    dir: "public",
    purpose:
      "The German template. Semicolon-delimited for German Excel, BOM for the umlauts. Proves the German headers auto-map without the user touching the mapping step.",
    encoding: "utf-8-bom",
    delimiter: ";",
    headerCount: 9,
    dataRowCount: 4,
    mustMap: [
      "first_name",
      "last_name",
      "email",
      "phone",
      "job_title",
      "company_name",
      "company_domain",
      "linkedin_url",
      "notes",
    ],
    validRows: 4,
    errorRows: 0,
    cells: [
      { row: 2, field: "last_name", value: "Müller" },
      { row: 3, field: "first_name", value: "Björn" },
      { row: 4, field: "company_domain", value: "suedlicht.example" },
      { row: 5, field: "company_name", value: null },
    ],
  },
];
