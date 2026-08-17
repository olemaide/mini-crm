/**
 * Message-catalogue parity check.
 *
 * Compares every locale against the English source and reports keys that are
 * missing, orphaned, or structurally mismatched.
 *
 * Until the German pass (Phase 9b) this runs in warn mode — missing `de` keys
 * are expected while the UI is still moving. Pass `--strict` to make any
 * difference a failure; CI switches to that once `de` is complete.
 *
 *   pnpm i18n:check           warn only
 *   pnpm i18n:check --strict  fail on any difference
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultLocale, locales } from "../src/i18n/config";

type Catalogue = Record<string, unknown>;

const MESSAGES_DIR = join(process.cwd(), "messages");
const strict = process.argv.includes("--strict");

function load(locale: string): Catalogue {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")) as Catalogue;
}

/** Flattens nested messages into dotted paths: `nav.contacts`. */
function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();

  if (typeof value === "string") {
    out.set(prefix, value);
    return out;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const [k, v] of flatten(child, path)) out.set(k, v);
    }
  }

  return out;
}

/**
 * Extracts ICU argument names so a translation cannot silently drop one.
 *
 * The trailing lookahead matters. An ICU argument is always `{name}` or
 * `{name, type, …}`, so the identifier is followed by `}` or `,`. Without that
 * check, the literal text inside a plural branch — `=0 {Nothing overdue}` —
 * parses as an argument named "Nothing" and every plural message reports a
 * false mismatch.
 */
function placeholders(message: string): Set<string> {
  return new Set(
    Array.from(message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?=[},])/g), (m) => m[1] as string),
  );
}

const source = flatten(load(defaultLocale));
let failures = 0;

for (const locale of locales) {
  if (locale === defaultLocale) continue;

  const target = flatten(load(locale));
  const missing: string[] = [];
  const orphaned: string[] = [];
  const mismatched: string[] = [];

  for (const [key, sourceMessage] of source) {
    const translated = target.get(key);
    if (translated === undefined) {
      missing.push(key);
      continue;
    }

    const expected = placeholders(sourceMessage);
    const actual = placeholders(translated);
    const dropped = [...expected].filter((p) => !actual.has(p));
    if (dropped.length > 0) {
      mismatched.push(`${key} (missing placeholder: ${dropped.join(", ")})`);
    }
  }

  for (const key of target.keys()) {
    if (!source.has(key)) orphaned.push(key);
  }

  const total = source.size;
  const translated = total - missing.length;
  const percent = total === 0 ? 100 : Math.round((translated / total) * 100);

  console.log(`\n${locale}: ${translated}/${total} keys (${percent}%)`);

  for (const [label, list] of [
    ["missing", missing],
    ["orphaned", orphaned],
    ["placeholder mismatch", mismatched],
  ] as const) {
    if (list.length === 0) continue;
    console.log(`  ${label} (${list.length}):`);
    for (const key of list) console.log(`    - ${key}`);
  }

  // A dropped placeholder is a runtime bug in any mode; a missing key is only
  // a failure once we have committed to the locale being complete.
  if (mismatched.length > 0 || (strict && (missing.length > 0 || orphaned.length > 0))) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\ni18n parity check failed for ${failures} locale(s).`);
  process.exit(1);
}

console.log(`\ni18n parity check passed${strict ? " (strict)" : " (warn mode)"}.`);
