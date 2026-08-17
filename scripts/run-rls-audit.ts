/**
 * Runs scripts/rls-audit.sql against a database.
 *
 * Wrapped in a script rather than inlined into package.json so it works the
 * same on Windows, macOS and CI, and so a missing `psql` produces an
 * explanation instead of a cryptic ENOENT.
 *
 *   pnpm db:audit                     against the local Supabase stack
 *   DATABASE_URL=… pnpm db:audit      against staging or production
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Default connection string for `supabase start`. */
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const scriptPath = join(process.cwd(), "scripts", "rls-audit.sql");

if (!existsSync(scriptPath)) {
  console.error(`Cannot find ${scriptPath}`);
  process.exit(1);
}

const target = process.env.DATABASE_URL
  ? "the configured DATABASE_URL"
  : "the local Supabase stack";
console.log(`Running RLS audit against ${target}…`);

const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", scriptPath], {
  stdio: "inherit",
});

if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
  console.error(
    [
      "",
      "`psql` was not found on PATH.",
      "",
      "The RLS audit is the one automated guard against cross-tenant data leakage,",
      "so it should not be skipped. Install the PostgreSQL client tools:",
      "",
      "  Windows   winget install PostgreSQL.PostgreSQL",
      "  macOS     brew install libpq && brew link --force libpq",
      "  Ubuntu    sudo apt-get install -y postgresql-client",
      "",
      "GitHub Actions runners already have psql available.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
