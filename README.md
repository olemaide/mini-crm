# Mini CRM

A lightweight CRM for small B2B sales teams. Contacts and companies, a Kanban
pipeline, a chronological activity feed, and follow-up tasks that do not get
forgotten.

Build plan: [`../MINI-CRM-MVP-PLAN.md`](../MINI-CRM-MVP-PLAN.md) — read it before
adding anything. It sets out the phases, the schema, and the decisions that have
already been made and closed.

**Current status: Phase 9 code complete.** Sign-in, organizations, roles, team
invitations, contacts, companies, CSV import, the Kanban pipeline, the activity
feed, follow-up tasks, ⌘K search and Polar billing all work against a live
Supabase project in `eu-central-1`. Phase 9 added a nonce-based CSP, a Postgres
rate limiter, self-serve export and erasure, the German legal pages, a live
dashboard and the sample-data seeder.

What is still open before real customers, none of it code:

- **Custom SMTP in Supabase Auth.** The built-in sender is rate-limited and
  explicitly not for production — a launch blocker (§1.6).
- **Leaked-password protection**, one dashboard toggle.
- **The `TODO:` entries in `src/lib/legal/documents.ts`** — legal entity, address,
  register number, VAT id. The pages show a red draft warning until they are gone.
- **Two scheduled jobs** (`purge_due_organizations`, `prune_rate_limits`). The
  migrations deliberately do not `create extension pg_cron`, because CI replays
  them against a plain Postgres image; see `RELEASE-CHECKLIST.md` §7d.
- **Marketing site, help articles and the uptime monitor.**

Billing runs against the **Polar sandbox** and needs `POLAR_ACCESS_TOKEN` set
before checkout will open — until then the billing page renders a "not
configured" state and everything else works normally.

There is **no transactional email provider** — invitations are copyable one-time
links, and Supabase Auth sends the auth mail. See §1.6 of the plan for what that
costs and when to revisit it.

---

## Stack

| Layer                 | Choice                                            |
| --------------------- | ------------------------------------------------- |
| Framework             | Next.js 16.3 (App Router, Turbopack) · React 19.2 |
| Language              | TypeScript, strict + `noUncheckedIndexedAccess`   |
| Styling               | Tailwind CSS 4 · shadcn/ui (Base UI)              |
| i18n                  | next-intl — English default, German second locale |
| Data                  | Supabase (Postgres + RLS + Auth)                  |
| Forms                 | react-hook-form + zod 4                           |
| Tables / server state | TanStack Table + TanStack Query                   |
| Drag & drop           | dnd-kit                                           |
| Hosting               | Netlify                                           |

Monitoring (Sentry) and analytics (PostHog) are deliberately deferred — see §1.4
of the plan for what replaces them and when to bring each one back.

**Vitest is no longer deferred.** It was reinstated in Phase 9 on the pure
functions, which is where §1.4 said to point it first. Playwright is still out;
the manual release checklist remains the E2E net.

---

## Getting started

```bash
pnpm install

# Start the local Supabase stack (requires Docker Desktop running).
pnpm db:start

# Copy the printed anon + service_role keys into .env.local,
# then apply migrations and generate types.
pnpm db:reset
pnpm db:types

pnpm dev
```

Without Docker the app still runs — `/api/health` will report
`"database": "unreachable"` and return 503, which is the correct signal.

---

## Scripts

| Command                       | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                    | Dev server                                                  |
| `pnpm verify`                 | typecheck → lint → i18n → test → build. Run before pushing. |
| `pnpm typecheck`              | `tsc --noEmit`                                              |
| `pnpm lint` / `pnpm lint:fix` | ESLint (`next lint` was removed in Next 16)                 |
| `pnpm format`                 | Prettier                                                    |
| `pnpm i18n:check`             | Message catalogue parity (warn mode)                        |
| `pnpm i18n:check:strict`      | Same, failing on any gap — CI switches to this in Phase 9b  |
| `pnpm test`                   | Vitest unit suite (~1 s)                                    |
| `pnpm test:watch`             | Same, in watch mode                                         |
| `pnpm test:coverage`          | Suite plus a coverage report                                |
| `pnpm db:start` / `db:stop`   | Local Supabase stack                                        |
| `pnpm db:reset`               | Re-apply all migrations locally                             |
| `pnpm db:diff -- <name>`      | Author a migration from local schema changes                |
| `pnpm db:push`                | Apply migrations to the linked remote project               |
| `pnpm db:types`               | Regenerate `src/types/database.ts`                          |
| `pnpm db:audit`               | Run the RLS audit (needs `psql` on PATH)                    |

---

## Conventions

These are enforced, not aspirational. The full list is §3 of the plan.

1. **Money is `bigint` cents.** Never a float. Formatted only at render time.
2. **Timestamps are `timestamptz`, always UTC.** Converted to the org timezone
   when displayed. `date-fns-tz` for the maths, next-intl for the formatting.
3. **Every table** gets `id`, `organization_id`, `created_at`, `updated_at`,
   RLS enabled, and four policies. `pnpm db:audit` fails the build otherwise.
4. **No hardcoded user-facing strings.** ESLint rejects literals in JSX. Add the
   English string to `messages/en.json`; German follows in Phase 9b.
5. **Stored vs translated text.** Text a user can edit (stage names, task
   titles, notes) is _stored_ in the org's language and never re-translated.
   Text the system generates (feed sentences, overdue labels) stores only a type
   plus metadata and is _composed at render time_. Getting this backwards is the
   classic i18n bug.
6. **Phone numbers are E.164 with an RFC 3966 extension suffix** —
   `+493012345678;ext=42`. Unparseable input is kept verbatim instead of being
   discarded. The suffix spelling is not cosmetic: the value is compared for
   equality by dedupe, and prose ("x42", "Durchwahl 42") would make two records
   of one person look different. It is also a valid `tel:` href.
7. **Environment access goes through `@/env`,** never `process.env`.
8. **The service-role key never reaches the browser.** CI greps the client
   bundle for it.
9. **Server Actions return `ActionResult`, never throw across the boundary.**
   Errors carry a translation _key_ (`errors.action.*`), so the message is
   composed in the reader's language — same rule as #5.

### Tenant isolation

The security model. Read this before touching a policy.

- **Every RLS policy uses the set form:**
  `organization_id in (select public.my_organization_ids())`. Never the scalar
  `is_org_member(organization_id)` — that is evaluated once per row and was
  measured **30× slower** on a 10,000-row table. The scalar helpers are still
  correct inside RPCs, where they run once per request.
- The helper functions are `security definer` with `set search_path = ''`, and
  **both properties are load-bearing** — without definer, a policy on
  `organization_members` that reads `organization_members` recurses forever.
- They call `(select auth.uid())`, not `auth.uid()`, so Postgres evaluates it
  once per statement.
- Rules RLS cannot express live in triggers: `guard_membership_changes()` keeps
  at least one owner and restricts who may grant ownership;
  `validate_owner_is_member()` stops a record being owned by an outsider.
- Those triggers deliberately trust callers with **no JWT** (service role). A
  careless `createSupabaseAdminClient()` write bypasses the invariants too, not
  just RLS.
- Cross-tenant links are prevented **structurally**: `contacts` references
  `companies (organization_id, id)` through a composite foreign key, so a
  contact pointing at another tenant's company cannot be represented at all.
- **Never run a query per row under RLS.** A policy's subplan is re-planned on
  every execution — 0.07 ms becomes 4.5 ms. Fine for a page view, ruinous in a
  loop (measured at 35× on import). Go set-based, or use `security definer`
  with an explicit `is_org_member` check first and every query scoped by an
  `organization_id` read from a trusted row, never from the caller.
- **Any function comparing `citext` needs `set search_path = 'extensions'`.**
  With `search_path = ''` the citext `=` operator is invisible and Postgres
  silently falls back to case-sensitive `text` comparison — no error, and the
  unique index still behaves correctly, so dedupe misses and the insert then
  blows up on the constraint.

Invitation tokens are credentials: only a SHA-256 hash is stored, the raw token
is returned exactly once by `create_invitation()`, and acceptance requires being
authenticated as the invited address.

### The activity feed

- **A client may only ever insert the four types a human authors** (`note`,
  `email_logged`, `call_logged`, `meeting_logged`), and only as itself. System
  rows are written by triggers, which run as the table owner and bypass RLS.
  Without that restriction anyone could POST a forged `deal_won`.
- **Every activity has exactly one subject.** `num_nonnulls(contact_id,
company_id, deal_id) = 1`. Roll-up (a deal's feed showing its contact's
  entries) happens in the read path, and the constraint is what guarantees the
  union's branches are disjoint — which is what makes keyset pagination over it
  correct without de-duplication.
- **System rows never contain prose.** `body` is null; the sentence is composed
  at render time from `type` + `metadata`. Stage names are the exception that
  proves convention 5: they are snapshotted into metadata because they are
  _stored text_, and snapshotting keeps history readable after a rename or a
  stage deletion.
- `guard_activity_edit()` freezes the subject, type, actor and `created_at`. RLS
  decides _who_ may update; a policy cannot compare OLD to NEW, so without the
  trigger an author could re-point their note at another record.
- **Note bodies are the one place a user controls what reaches the DOM.**
  `parseMarkdownLite` emits a token tree and the renderer builds React elements,
  so there is no HTML string and nothing to sanitise. `safeHref` allows only
  `http`, `https` and `mailto`. Both are covered by fixtures — see below.

### Tasks and time

- **Overdue is computed, never stored.** A task is overdue when
  `status = 'open' AND due_at < now()`, evaluated on every read. An
  `is_overdue` column would be correct until the clock moved.
- **`completed_at` is derived by trigger on every write**, and client-supplied
  values are discarded. It cannot be backdated — a follow-up finished late must
  not be able to look like it was done on time.
- **All timezone arithmetic goes through `lib/tasks/due.ts`,** which is pure and
  takes `now` as an argument. Never `(a - b) / 86_400_000`: across a DST
  boundary a day is 23 or 25 hours, so the division floors to the wrong day.
  `date-fns-tz` does the maths, `next-intl` does the formatting, and the two
  never mix.
- **Due dates land at 09:00 in the org's timezone, skipping weekends,** computed
  by `next_business_due_at()`. 09:00 is chosen partly because it always exists —
  an hour inside 02:00–03:00 is undefined twice a year in `Europe/Berlin`.
- **Automation can be suppressed for bulk writes** by setting the transaction-
  local GUC `app.suppress_task_automation` to `'on'`. Absent means "create the
  task", which is right for the ordinary path; a browser cannot reach the flag.
- Task titles are **stored text**, seeded once per org locale from
  `lib/seed/tasks.ts` and never re-translated (convention 5).

### Search

- **`search_key()` folds both sides of every comparison** — lower-case, strip
  accents, trim. It is applied to the stored value (in a generated column) and
  to the needle, so the two cannot disagree.
- **It is `IMMUTABLE` only because the unaccent dictionary is named explicitly**
  as a `regdictionary`. The plain `unaccent(text)` is `STABLE` and Postgres
  refuses it in an index expression. Without that trick every search is a scan.
- **`lib/search/fold.ts` is the TypeScript twin of `search_key()`,** used to fold
  the needle before it reaches PostgREST. NFD stripping alone is _not_ enough:
  `ß`, `æ`, `ø`, `þ`, `ł`, `đ` have no decomposition and expand to other
  letters. The expansion table was transcribed from the database, and the
  fixtures compare the two — if they drift, search silently finds nothing.
- **The search columns are `generated always as (...) stored`, not expression
  indexes.** GIN trigram indexes are lossy, so every candidate row is rechecked;
  with an expression index that re-ran the unaccent dictionary per row and cost
  338 ms against 50k contacts, versus 7.9 ms reading a stored column.
- **`organization_id` is the first column of every search index** (via
  `btree_gin`), so a scan starts scoped to one tenant instead of filtering
  afterwards.
- Needles of one or two characters use the **btree prefix** indexes; three or
  more use **`LIKE '%needle%'` on GIN**. A single character is refused.
- Saved views store the **query string**, replayed through the same parsing as a
  hand-typed URL.

### Billing

- **`subscriptions` has no write policy.** Members can read it; only the webhook
  handler writes, through the service-role client. A member who could update
  this row could grant themselves the Pro plan.
- **`billing_events` is deliberately unreachable** — RLS on, zero policies. Its
  primary key is Polar's event id, so a replayed delivery collides and the
  handler returns 200 without touching anything. The claim is inserted _before_
  any work, which also closes the race between concurrent deliveries.
- **Entitlements are derived, never stored** — same rule as "overdue".
  `org_has_write_access()` and `plan_contact_limit()` compute from the plan, the
  trial end and the period end at read time.
- **The limits that protect revenue are enforced by triggers,** not by
  `requireEntitlement()`. Anyone signed in can issue PostgREST requests
  directly; the Server Action check exists to produce a clear translated message,
  not to be the boundary.
- **A signature failure and a schema failure are different.** A bad signature is 403. A payload that fails the SDK's zod model is still processed from the raw
  JSON — the signature already proved it came from Polar — because dropping a
  real subscription change over a new field would be a silent revenue bug.
- Sandbox and production are **different Polar hosts**; `POLAR_SERVER` picks one.
  Getting it wrong means checkouts that never become real money.

### Tests

- **Everything lives in `/tests`**, flat, with the filename recording its
  subject: `lib.csv.rows.test.ts` covers `src/lib/csv/rows.ts`. One directory,
  and `src/` holds only shipped code.
- **`/tests` is git-ignored by project decision.** Read the note in `.gitignore`
  before relying on the suite: the files are not in version control, so **CI does
  not run them** and a fresh clone has none. `pnpm test` is a local discipline.
  `vitest.config.mts` sets `passWithNoTests`, so `pnpm verify` still succeeds for
  someone who has not written them.
- **Vitest covers the pure functions only** — `lib/` plus the two dashboard
  helpers. 483 tests, ~1 s, 94% statements on that scope.
- **Nothing is mocked.** A test that mocks the Supabase client proves the mock
  works. Anything needing a database is verified another way: the RLS audit in
  CI, the live RPC checks recorded in the Phase 9 notes, and the manual
  two-browser check at the top of the release checklist.
- **The fixture case tables are shared** with `/dev/import-fixtures`. A case
  added to `money-cases.ts`, `due-cases.ts`, `fold-cases.ts` or
  `markdown-cases.ts` is picked up by both the page and the suite, so the two
  cannot drift into disagreeing.
- **`server-only` is aliased** to `tests/server-only-stub.ts` under Vitest.
  Without it, every query and action module fails to import.
- **`SKIP_ENV_VALIDATION` bypasses zod _defaults_, not just checks.** That is why
  the config sets `LOG_LEVEL` explicitly: `env.LOG_LEVEL` comes back undefined
  and pino throws on an undefined level at import time.
- Writing the suite found four defects, all now fixed: a dropped phone
  extension, a wrong comment in `money.ts`, a legal page with no draft warning,
  and an unreachable `noHeader` guard. See §1.4a of the plan.

### Security headers and CSP

- **The CSP lives in `proxy.ts`, not `next.config.ts`.** It carries a per-request
  script nonce, which static config cannot generate. The other headers (HSTS,
  `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`,
  `Permissions-Policy`) stay in `next.config.ts` because they never vary.
- **Never add a second CSP.** Browsers enforce every policy they are sent, so a
  nonce-less copy would block the scripts the nonced one allows.
- **`style-src` allows `'unsafe-inline'` on purpose.** A nonce cannot be attached
  to an inline `style` _attribute_, and dnd-kit writes one on every dragged card.
  Style injection is defacement; `script-src` is where the real protection is and
  that one is strict.
- **Nonces force dynamic rendering.** Nothing is statically optimised. Every
  authenticated route was cookie-driven already; the marketing and legal pages are
  what this actually costs.

### Rate limiting

- **The counter is a Postgres row**, not Redis. Netlify functions share no
  memory, so an in-process counter protects nothing — and a fourth subprocessor
  to name in the AV-Vertrag is a real cost for a single-row update.
- **Fixed window, not a sliding log.** A sliding window needs a row per hit,
  turning a login flood into a write flood. The trade-off is 2× burst across a
  window boundary, accepted knowingly.
- **Buckets are hashed at the call site.** An email address in `rate_limits`
  would turn an infrastructure table into a register of who tried to sign in.
- **It fails open.** If the limiter is unreachable the request proceeds and the
  failure logs at error level: a limiter that fails closed turns one bad
  connection into a total outage, including for whoever is trying to fix it.
  Supabase Auth's own limits remain underneath.
- **Only `service_role` may call `consume_rate_limit`.** Granting `authenticated`
  would let any signed-in user burn someone else's budget by guessing a bucket.

### GDPR: export and erasure

- **Export is a Route Handler, not a Server Action**, because the product is a
  file. `Content-Disposition` gets the filename, the content type and the
  browser's own download UI; an action would buffer the whole tenant twice.
- **`export_organization()` uses `to_jsonb(row)`**, so a column added in a later
  phase appears in the export automatically. Hand-listing columns fails silently
  and in the worst direction.
- **CSV cells beginning `=`, `+`, `-` or `@` are prefixed with an apostrophe.**
  Otherwise a note starting `=cmd|…` is a CSV injection against whoever opens
  the file in Excel.
- **Erasure is two-step.** Phase 1 shipped a policy letting any owner
  `delete from organizations` straight through PostgREST — no confirmation, no
  export, no way back. That policy is gone; deletion is now _scheduled_ with a
  30-day grace period and carried out by `purge_due_organizations()`.
- **The three `deletion_*` columns are guarded by a trigger.** The table-wide
  admin UPDATE policy would otherwise let one PATCH skip both the confirmation
  and the grace period. The trigger only yields to a transaction-local GUC that
  nothing reachable through PostgREST can set.
- **`auth.users` rows survive tenant deletion.** A person may belong to several
  organizations; erasing one must not sign them out of another.

### The dashboard

- **Every figure comes from `dashboard_summary()` in one round trip.** Fetching
  pages of deals and summing them in JavaScript is both N+1 and wrong — a
  paginated sum under-reports the moment a tenant outgrows one page, which is
  exactly when the number starts to matter.
- **Day and month boundaries are passed in from the app.** "Today" and "this
  month" depend on the organization's timezone, and that arithmetic already lives
  in `lib/tasks/due.ts`. A second implementation in SQL would disagree across a
  DST boundary.
- **The onboarding checklist is derived, never stored.** A `has_imported` flag
  would go stale the first time someone undid an import.
- **The demo seeder writes through the ordinary RLS-scoped client**, not a
  definer RPC, so triggers, policies and entitlement checks all fire and the
  seeded tenant is indistinguishable from a hand-typed one. It refuses on a
  non-empty workspace, which is why there is no "remove sample data" to build.

### Legal pages

- The four documents live in `src/lib/legal/documents.ts` as **data, not message
  keys**. They are binding in German only; a translation in `messages/en.json`
  would read as an equally valid version of a contract.
- `hasUnfilledDetails()` scans for `TODO:` and renders a visible draft warning, so
  an unfinished Impressum cannot quietly go live. In Germany that is an
  `Abmahnung` waiting to happen.
- `/impressum` and friends are public and must stay out of `PROTECTED_PREFIXES`.

### Lists and pagination

- Sort, filter and page live in the URL, so views are shareable and
  back/forward works. Parsed and clamped in `lib/list-params.ts`.
- Sortable columns are a **closed allow-list**, each backed by an index ending
  in `id` — without a total order, rows drift between pages.
- Tables are hand-rolled rather than built on TanStack Table: every data
  operation runs in Postgres, so the library's client-side row models would go
  unused. The dependency is installed but currently unused — remove it if
  nothing needs it by the end of Phase 3.

### Next.js 16 gotchas

Most tutorials still describe Next 15. In this codebase:

- `middleware.ts` is **`proxy.ts`**, exporting a function named `proxy`, running
  on the Node.js runtime only.
- `cookies()`, `headers()`, `params` and `searchParams` are **async**.
- `revalidateTag` requires a cacheLife argument. For post-mutation
  read-your-writes, use **`updateTag`** or **`refresh`**.
- shadcn is built on **Base UI**: composition uses `render={<Link/>}`, not
  `asChild`. There is no `form` component — use `field` with react-hook-form.

---

## Before every deploy

Walk [`RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md). With E2E tests deferred it
is the regression net, and item 1 (cross-tenant isolation) is never skipped.
