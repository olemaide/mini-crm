import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest, reinstated in Phase 9.
 *
 * The build plan deferred it (§1.4) and named it the cheapest of the deferred
 * tools to bring back, pointed at the pure functions in `lib/`. That is exactly
 * what this covers: money parsing, the normalizers, CSV handling, the markdown
 * URL allow-list, due-date arithmetic across DST, and the Phase 9 additions
 * (CSV-injection defusal, rate-limit key hashing, legal-document completeness).
 *
 * Deliberately **not** covered here:
 *
 *   * Anything touching Supabase. A test that mocks the client proves the mock
 *     works. Tenant isolation is guarded by `scripts/rls-audit.sql` in CI and by
 *     the two-browser check on the release checklist — that is a deliberate
 *     choice from §1.4, not a gap this suite should paper over.
 *   * React components. They are thin, and the interesting logic was extracted
 *     into `lib/` precisely so it could be tested without a DOM.
 *
 * `environment: 'node'` because nothing under test needs a DOM — that keeps the
 * suite fast enough to run on every save.
 *
 * `.mts` rather than `.ts`: Vite 8 loads a `.ts` config as CommonJS and warns
 * about the ESM syntax in it.
 */
export default defineConfig({
  resolve: {
    // Resolves the `@/*` paths from tsconfig.json natively. Vite 8 supports this
    // directly, so the vite-tsconfig-paths plugin is not needed.
    tsconfigPaths: true,
    alias: {
      // See tests/server-only-stub.ts for why this is aliased.
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    /*
     * Every test lives in `tests/`, flattened, with the filename recording the
     * subject's path — `lib.csv.rows.test.ts` covers `src/lib/csv/rows.ts`. One
     * directory, and `src/` holds only shipped code.
     */
    include: ["tests/**/*.test.ts"],
    /*
     * `tests/` is git-ignored by project decision, so a fresh clone has no test
     * files. Without this, `pnpm test` — and therefore `pnpm verify` — would fail
     * with "No test files found" for anyone who did not write them locally.
     */
    passWithNoTests: true,
    /*
     * `@/env` validates on import and would fail without a populated .env. The
     * modules under test only *construct* clients inside functions the suite
     * never calls, so skipping validation is honest here rather than a way of
     * hiding a missing variable.
     */
    env: {
      SKIP_ENV_VALIDATION: "true",
      /*
       * `LOG_LEVEL` is needed explicitly because `skipValidation` bypasses zod's
       * *defaults* as well as its checks — `env.LOG_LEVEL` comes back undefined,
       * and pino throws on an undefined level at import time. Any module that
       * transitively imports the logger would fail to load without this.
       */
      LOG_LEVEL: "silent",
    },
    /*
     * Coverage is scoped to code that *can* be unit-tested, so the number means
     * something. Everything excluded below needs a live request or database, and
     * mocking it would only prove the mock works — those paths are covered by
     * the RLS audit, the live RPC checks and the manual release checklist
     * instead.
     */
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/features/dashboard/queries.ts"],
      exclude: [
        "**/*.test.ts",
        "src/lib/supabase/**", // constructs clients; needs cookies()/env
        "src/lib/logger.ts", // pino transport wiring
        "src/lib/auth/**", // needs a request context and a session
        "src/lib/polar/client.ts", // constructs the Polar SDK client
        "src/lib/utils.ts", // a one-line clsx/tailwind-merge wrapper
      ],
      reporter: ["text", "json-summary"],
    },
  },
});
