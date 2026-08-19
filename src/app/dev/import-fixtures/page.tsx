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
import { parseMoneyToCents } from "@/lib/money";
import {
  DAY_COUNT_CASES,
  DUE_CASES,
  RANGE_CASES,
  runDayCountCase,
  runDueCase,
  runRangeCase,
} from "./due-cases";
import { FIXTURES, type FixtureExpectation } from "./expectations";
import { FOLD_CASES, runFoldCase } from "./fold-cases";
import { HREF_CASES, MARKDOWN_CASES, runHrefCase, runMarkdownCase } from "./markdown-cases";
import { MONEY_CASES } from "./money-cases";

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

  const moneyChecks = MONEY_CASES.map((testCase) => {
    const actual = parseMoneyToCents(testCase.input);
    return {
      ...testCase,
      actual,
      pass: actual === testCase.expected,
    };
  });

  const markdownChecks = MARKDOWN_CASES.map((testCase) => {
    const actual = runMarkdownCase(testCase.input);
    return { ...testCase, actual, pass: actual === testCase.expected };
  });

  const hrefChecks = HREF_CASES.map((testCase) => {
    const actual = runHrefCase(testCase.input);
    return {
      input: testCase.input,
      expected: testCase.expected,
      actual,
      pass: actual === testCase.expected,
      why: testCase.expected === null ? "refused" : "allowed",
    };
  });

  const dueChecks = [
    ...DUE_CASES.map((testCase) => {
      const actual = runDueCase(testCase);
      return {
        input: `${testCase.label} · ${testCase.timeZone}`,
        expected: testCase.expected,
        actual,
        why: testCase.why,
        pass: actual === testCase.expected,
      };
    }),
    ...RANGE_CASES.map((testCase) => {
      const actual = runRangeCase(testCase);
      return {
        input: `dayRange · ${testCase.label}`,
        expected: testCase.expected,
        actual,
        why: "today's boundaries as UTC instants",
        pass: actual === testCase.expected,
      };
    }),
    ...DAY_COUNT_CASES.map((testCase) => {
      const actual = String(runDayCountCase(testCase));
      return {
        input: `calendarDaysBetween · ${testCase.label}`,
        expected: String(testCase.expected),
        actual,
        why: testCase.timeZone,
        pass: actual === String(testCase.expected),
      };
    }),
  ];

  const foldChecks = FOLD_CASES.map((testCase) => {
    const actual = runFoldCase(testCase.input);
    return { ...testCase, actual, pass: actual === testCase.expected };
  });

  const total =
    results.reduce((sum, r) => sum + r.checks.length, 0) +
    moneyChecks.length +
    markdownChecks.length +
    hrefChecks.length +
    dueChecks.length +
    foldChecks.length;
  const failed =
    results.reduce(
      (sum, r) => sum + r.checks.filter((c) => !c.pass).length + (r.fatal ? 1 : 0),
      0,
    ) +
    moneyChecks.filter((c) => !c.pass).length +
    markdownChecks.filter((c) => !c.pass).length +
    hrefChecks.filter((c) => !c.pass).length +
    dueChecks.filter((c) => !c.pass).length +
    foldChecks.filter((c) => !c.pass).length;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Import &amp; parsing fixtures</h1>
        <p className="text-sm text-muted-foreground">
          Stands in for unit tests on the CSV pipeline and the money parser. Run before any release
          that touches import or deal values.
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

      <section className="rounded-lg border">
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <span
            className={cn(
              "mt-0.5 inline-block size-2.5 shrink-0 rounded-full",
              moneyChecks.some((c) => !c.pass) ? "bg-destructive" : "bg-emerald-500",
            )}
          />
          <div>
            <h2 className="font-mono text-sm font-medium">parseMoneyToCents</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Deal values arrive as free text. Both the German and English grammars must parse, and
              a lone separator is resolved by the group-of-three test.
            </p>
          </div>
        </div>

        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {moneyChecks.map((c, index) => (
              <tr key={index} className={cn(!c.pass && "bg-destructive/5")}>
                <td className="px-4 py-1.5 font-mono text-xs">
                  {c.input === "" ? "(empty)" : JSON.stringify(c.input)}
                </td>
                <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">
                  {c.pass ? String(c.actual) : `expected ${c.expected} · got ${c.actual}`}
                </td>
                <td className="px-4 py-1.5 text-xs text-muted-foreground">{c.why}</td>
                <td className="w-10 px-4 py-1.5 text-right">{c.pass ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border">
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <span
            className={cn(
              "mt-0.5 inline-block size-2.5 shrink-0 rounded-full",
              markdownChecks.some((c) => !c.pass) || hrefChecks.some((c) => !c.pass)
                ? "bg-destructive"
                : "bg-emerald-500",
            )}
          />
          <div>
            <h2 className="font-mono text-sm font-medium">parseMarkdownLite &amp; safeHref</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Note bodies are the one place a user controls what reaches the DOM. The parser emits
              data and the renderer builds React elements, so there is no HTML to sanitise — but the
              URL allow-list still has to hold. Every case marked XSS must come out as inert text.
            </p>
          </div>
        </div>

        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {markdownChecks.map((c, index) => (
              <tr key={index} className={cn(!c.pass && "bg-destructive/5")}>
                <td className="px-4 py-1.5 font-mono text-xs">{JSON.stringify(c.input)}</td>
                <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">
                  {c.pass ? c.actual : `expected ${c.expected} · got ${c.actual}`}
                </td>
                <td className="px-4 py-1.5 text-xs text-muted-foreground">{c.why}</td>
                <td className="w-10 px-4 py-1.5 text-right">{c.pass ? "✓" : "✗"}</td>
              </tr>
            ))}
            {hrefChecks.map((c, index) => (
              <tr key={`href-${index}`} className={cn(!c.pass && "bg-destructive/5")}>
                <td className="px-4 py-1.5 font-mono text-xs">
                  safeHref({JSON.stringify(c.input)})
                </td>
                <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">
                  {c.pass ? String(c.actual) : `expected ${c.expected} · got ${c.actual}`}
                </td>
                <td className="px-4 py-1.5 text-xs text-muted-foreground">{c.why}</td>
                <td className="w-10 px-4 py-1.5 text-right">{c.pass ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border">
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <span
            className={cn(
              "mt-0.5 inline-block size-2.5 shrink-0 rounded-full",
              dueChecks.some((c) => !c.pass) ? "bg-destructive" : "bg-emerald-500",
            )}
          />
          <div>
            <h2 className="font-mono text-sm font-medium">task due dates</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every case pins <code>now</code> explicitly. The DST rows are the point: on 29 March
              and 25 October a day in Europe/Berlin is 23 or 25 hours, so dividing a millisecond
              difference by 86,400,000 lands on the wrong day and a task reads &ldquo;due
              tomorrow&rdquo; on the day it is due.
            </p>
          </div>
        </div>

        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {dueChecks.map((c, index) => (
              <tr key={index} className={cn(!c.pass && "bg-destructive/5")}>
                <td className="px-4 py-1.5 font-mono text-xs">{c.input}</td>
                <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">
                  {c.pass ? c.actual : `expected ${c.expected} · got ${c.actual}`}
                </td>
                <td className="px-4 py-1.5 text-xs text-muted-foreground">{c.why}</td>
                <td className="w-10 px-4 py-1.5 text-right">{c.pass ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border">
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <span
            className={cn(
              "mt-0.5 inline-block size-2.5 shrink-0 rounded-full",
              foldChecks.some((c) => !c.pass) ? "bg-destructive" : "bg-emerald-500",
            )}
          />
          <div>
            <h2 className="font-mono text-sm font-medium">foldForSearch vs search_key</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The stored search columns are folded by Postgres; the needle is folded in TypeScript.
              Every expected value here was recorded from <code>select search_key(…)</code> against
              the database. If the two rules drift there is no error — searching
              <code> Größler</code> just silently finds nothing.
            </p>
          </div>
        </div>

        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {foldChecks.map((c, index) => (
              <tr key={index} className={cn(!c.pass && "bg-destructive/5")}>
                <td className="px-4 py-1.5 font-mono text-xs">{JSON.stringify(c.input)}</td>
                <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">
                  {c.pass ? JSON.stringify(c.actual) : `expected ${c.expected} · got ${c.actual}`}
                </td>
                <td className="px-4 py-1.5 text-xs text-muted-foreground">{c.why}</td>
                <td className="w-10 px-4 py-1.5 text-right">{c.pass ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
