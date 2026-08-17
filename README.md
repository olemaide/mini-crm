# Mini CRM

A lightweight CRM for small B2B sales teams. Contacts and companies, a Kanban
pipeline, a chronological activity feed, and follow-up tasks that do not get
forgotten.

Build plan: [`../MINI-CRM-MVP-PLAN.md`](../MINI-CRM-MVP-PLAN.md) — read it before
adding anything. It sets out the phases, the schema, and the decisions that have
already been made and closed.

**Current status: Phase 2 complete.** Sign-in, organizations, roles, team
invitations, contacts and companies work against a live Supabase project in
`eu-central-1`. CSV import (Phase 3) and the pipeline board (Phase 4) are next.

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

Invitation tokens are credentials: only a SHA-256 hash is stored, the raw token
is returned exactly once by `create_invitation()`, and acceptance requires being
authenticated as the invited address.

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
