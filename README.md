# Mini CRM

A lightweight CRM for small B2B sales teams. Contacts and companies, a Kanban
pipeline, a chronological activity feed, and follow-up tasks that do not get
forgotten.

Build plan: [`../MINI-CRM-MVP-PLAN.md`](../MINI-CRM-MVP-PLAN.md) — read it before
adding anything. It sets out the phases, the schema, and the decisions that have
already been made and closed.

**Current status: Phase 0 (foundations) complete.** No authentication and no
persisted data yet.

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
