import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";

import { env } from "@/env";
import {
  parseCsv,
  prepareRows,
  suggestMapping,
  type ImportField,
  type PreparedRow,
} from "@/lib/csv";
import { cn } from "@/lib/utils";
import { FIXTURES, type FixtureExpectation } from "./expectations";

/* eslint-disable i18next/no-literal-string --
 * Developer tooling, never shown to a user and never shipped: the page 404s
 * outside development. Translating it would be busywork.
 */

/**
 * Fixture harness for the CSV import pipeline.
 *
 * Stands in for the unit tests deferred in build plan §1.4. Run it before any
 * release that touches import — it is item 3 on the release checklist.
 *
 * Reads from the repo's `fixtures/csv/` directory at request time, so it only
 * works with the source tree present. That is fine: it is a development tool,
 * and the production guard below makes that explicit rather than implicit.
 */
export const dynamic = "force-dynamic";

type Check = { label: string; expected: string; actual: string; pass: boolean };

function check(label: string, expected: unknown, actual: unknown): Check {
  const e = expected === null ? "null" : String(expected);
  const a = actual === null ? "null" : String(actual);
  return { label, expected: e, actual: a, pass: e === a };
}

async function runFixture(expectation: FixtureExpectation): Promise<{
  expectation: FixtureExpectation;
  checks: Check[];
  fatal: string | null;
}> {
  const path = expectation.dir
    ? join(process.cwd(), expectation.dir, expectation.file)
    : join(process.cwd(), "fixtures", "csv", expectation.file);

  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch {
    return { expectation, checks: [], fatal: `Cannot read ${path}` };
  }

  const parsed = parseCsv(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    expectation.file,
  );

  if (!parsed.ok) {
    return { expectation, checks: [], fatal: `parseCsv failed: ${parsed.error}` };
  }

  const { headers, rows, encoding, delimiter } = parsed.data;
  const mapping = suggestMapping(headers);
  const prepared = prepareRows(rows, mapping);

  const mappedFields = new Set(Object.values(mapping).filter(Boolean) as ImportField[]);

  const checks: Check[] = [
    check("encoding", expectation.encoding, encoding),
    check(
      "delimiter",
      expectation.delimiter === "\t" ? "TAB" : expectation.delimiter,
      delimiter === "\t" ? "TAB" : delimiter,
    ),
    check("header count", expectation.headerCount, headers.length),
    check("data rows", expectation.dataRowCount, rows.length),
    check("valid rows", expectation.validRows, prepared.validCount),
    check("error rows", expectation.errorRows, prepared.errorCount),
  ];

  if (expectation.inFileDuplicates !== undefined) {
    checks.push(
      check("in-file duplicates", expectation.inFileDuplicates, prepared.inFileDuplicates),
    );
  }

  for (const field of expectation.mustMap) {
    checks.push(check(`maps ${field}`, true, mappedFields.has(field)));
  }

  const byRow = new Map<number, PreparedRow>(prepared.rows.map((row) => [row.row, row]));
  for (const cell of expectation.cells ?? []) {
    const row = byRow.get(cell.row);
    checks.push(check(`row ${cell.row} · ${cell.field}`, cell.value, row?.[cell.field] ?? null));
  }

  return { expectation, checks, fatal: null };
}

export default async function ImportFixturesPage() {
  // Development only. The fixtures are not bundled for deployment and this
  // page would leak internals if it were reachable in production.
  if (env.NODE_ENV === "production") notFound();

  const results = await Promise.all(FIXTURES.map(runFixture));
  const total = results.reduce((sum, r) => sum + r.checks.length, 0);
  const failed = results.reduce(
    (sum, r) => sum + r.checks.filter((c) => !c.pass).length + (r.fatal ? 1 : 0),
    0,
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">CSV import fixtures</h1>
        <p className="text-sm text-muted-foreground">
          Stands in for unit tests on the import pipeline. Run before any release that touches
          import.
        </p>
        <p
          className={cn(
            "mt-2 inline-block rounded-md px-2.5 py-1 text-sm font-medium",
            failed === 0
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {failed === 0 ? `All ${total} checks passed` : `${failed} of ${total} checks failed`}
        </p>
      </header>

      {results.map(({ expectation, checks, fatal }) => {
        const fileFailed = fatal !== null || checks.some((c) => !c.pass);

        return (
          <section key={expectation.file} className="rounded-lg border">
            <div className="flex items-start gap-3 border-b px-4 py-3">
              <span
                className={cn(
                  "mt-0.5 inline-block size-2.5 shrink-0 rounded-full",
                  fileFailed ? "bg-destructive" : "bg-emerald-500",
                )}
              />
              <div>
                <h2 className="font-mono text-sm font-medium">{expectation.file}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{expectation.purpose}</p>
              </div>
            </div>

            {fatal ? (
              <p className="px-4 py-3 font-mono text-sm text-destructive">{fatal}</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {checks.map((c, index) => (
                    <tr key={index} className={cn(!c.pass && "bg-destructive/5")}>
                      <td className="px-4 py-1.5 font-mono text-xs">{c.label}</td>
                      <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">
                        {c.pass ? c.actual : `expected ${c.expected} · got ${c.actual}`}
                      </td>
                      <td className="w-10 px-4 py-1.5 text-right">{c.pass ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </main>
  );
}
