-- Minimum Supabase-shaped scaffolding so `supabase/migrations/*.sql` can be
-- replayed against a plain `postgres:17` container in CI.
--
-- Why this file exists: the RLS audit job was written to loop over the
-- migrations and then run scripts/rls-audit.sql, but the migrations assume the
-- pieces a Supabase database is born with — the `extensions` and `auth` schemas,
-- the `anon` / `authenticated` / `service_role` roles, `auth.users` and
-- `auth.uid()`. Without them the very first migration fails on
-- `create extension citext with schema extensions`, so the audit that is
-- supposed to be the standing guard against cross-tenant leaks never ran at all.
--
-- This is deliberately the *smallest* stub that makes the schema apply. It is
-- not a Supabase emulator: it does not implement GoTrue, JWT parsing or
-- PostgREST. `auth.uid()` returns null here, which is correct for an audit that
-- only inspects catalogues. Anything that needs a real session belongs in the
-- manual cross-tenant matrix in RELEASE-CHECKLIST.md, run against a live
-- project.
--
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ci-bootstrap.sql

\set ON_ERROR_STOP on

-- ------------------------------------------------------------------- schemas

create schema if not exists extensions;
create schema if not exists auth;

-- ---------------------------------------------------------------------- roles
--
-- `nologin` on purpose: CI never connects as these, it only needs them to exist
-- so `grant ... to authenticated` and `to anon` resolve.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to authenticated, service_role;

-- ----------------------------------------------------------------- auth.users
--
-- Only the three columns the migrations actually touch:
--   id                  the foreign-key target for members, profiles, invitations
--   email               read by create_invitation() and the org RPCs
--   raw_user_meta_data   read by handle_new_user() to seed name and locale
--
-- Adding the rest of GoTrue's ~30 columns would imply a fidelity this stub does
-- not have.

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ auth.uid()
--
-- Reads the same GUC Supabase's PostgREST populates from the JWT, so a test that
-- wants to impersonate a user can `set local request.jwt.claim.sub = '<uuid>'`
-- and every RLS helper behaves. With no claim set it returns null, which makes
-- every tenant policy deny — the safe direction for a catalogue audit.

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
