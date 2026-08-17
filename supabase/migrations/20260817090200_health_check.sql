-- Health probe table.
--
-- Exists so /api/health can prove the database is reachable *through PostgREST
-- with RLS enabled* — the same path the app uses — rather than just proving the
-- process is alive. A single immutable row.
--
-- This is one of the few tables with no organization_id, and it is listed as an
-- explicit exception in scripts/rls-audit.sql.

create table public.health_check (
  ok boolean not null default true,
  checked_at timestamptz not null default now(),
  constraint health_check_single_row check (ok)
);

insert into public.health_check (ok) values (true);

alter table public.health_check enable row level security;

-- Readable by anyone, writable by no one. There is no insert/update/delete
-- policy, so RLS denies those for anon and authenticated alike.
create policy "health_check is world readable"
  on public.health_check
  for select
  to anon, authenticated
  using (true);

comment on table public.health_check is
  'Single-row liveness probe read by /api/health. Intentionally has no organization_id.';
