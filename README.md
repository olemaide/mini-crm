# Mini CRM

A lightweight CRM for small B2B sales teams. Contacts and companies, a Kanban
pipeline, a chronological activity feed, and follow-up tasks that do not get
forgotten.

Build plan: [`../MINI-CRM-MVP-PLAN.md`](../MINI-CRM-MVP-PLAN.md) — read it before
adding anything. It sets out the phases, the schema, and the decisions that have
already been made and closed.

**Current status: Phase 7 complete.** Sign-in, organizations, roles, team
invitations, contacts, companies, CSV import, the Kanban pipeline, the activity
feed, follow-up tasks and ⌘K search all work against a live Supabase project in
`eu-central-1`. Billing (Phase 8) is next.

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

Monitoring (Sentry), analytics (PostHog) and the test frameworks are
deliberately deferred — see §1.4 of the plan for what replaces them and when to
bring each one back.

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
| `pnpm verify`                 | typecheck → lint → i18n parity → build. Run before pushing. |
| `pnpm typecheck`              | `tsc --noEmit`                                              |
| `pnpm lint` / `pnpm lint:fix` | ESLint (`next lint` was removed in Next 16)                 |
| `pnpm format`                 | Prettier                                                    |
| `pnpm i18n:check`             | Message catalogue parity (warn mode)                        |
| `pnpm i18n:check:strict`      | Same, failing on any gap — CI switches to this in Phase 9b  |
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
6. **Environment access goes through `@/env`,** never `process.env`.
7. **The service-role key never reaches the browser.** CI greps the client
   bundle for it.
8. **Server Actions return `ActionResult`, never throw across the boundary.**
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
