-- Phase 1: organizations, membership and profiles.
--
-- The organization is the tenant. Every business table added from Phase 2
-- onward carries organization_id and is isolated by RLS against it.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug extensions.citext not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$'),
  -- Rendering defaults. Timestamps are stored UTC everywhere; timezone only
  -- affects display and business-day maths (task due dates in Phase 6).
  timezone text not null default 'Europe/Berlin',
  currency char(3) not null default 'EUR',
  -- Seeds stage names, task titles and system emails in this language.
  -- A member switching their own UI language must never rewrite stored text.
  locale text not null default 'en' check (locale in ('en', 'de')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.org_role as enum ('owner', 'admin', 'member');

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- "Which orgs does this user belong to" runs on every request via the RLS
-- helper; the composite PK only indexes the other direction.
create index organization_members_user_idx on public.organization_members (user_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or length(btrim(full_name)) <= 120),
  avatar_url text,
  -- Per-user interface language, distinct from the organization's locale.
  locale text not null default 'en' check (locale in ('en', 'de')),
  default_organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_default_org_idx on public.profiles (default_organization_id);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.organizations is 'The tenant. All business data hangs off this.';
comment on column public.organizations.locale is
  'Language used to SEED stored text (stage names, task titles). Not a UI preference.';
comment on column public.profiles.locale is 'The user''s UI language preference.';
