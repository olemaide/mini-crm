-- Contacts.
--
-- Two deviations from the original plan, both deliberate:
--
-- 1. No separate `email_normalized` generated column. The plan called for one,
--    but `citext` already compares case-insensitively, so the only extra
--    normalisation it offered was trimming — which a CHECK enforces directly.
--    One canonical column beats two that can disagree. Phase 3's dedupe tier 1
--    matches on `email` and behaves identically.
--
-- 2. The company link uses a *composite* foreign key. A plain
--    `company_id references companies(id)` would happily let a contact in org A
--    point at a company in org B. Referencing (organization_id, id) makes that
--    unrepresentable rather than merely policed.
--
-- NOTE: the RLS policies created here are replaced later in
-- 20260817040300_phase2_rls_set_based_policies.sql for performance.

create type public.contact_source as enum ('manual', 'csv', 'api');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  company_id uuid,

  first_name text check (first_name is null or length(first_name) <= 100),
  last_name text check (last_name is null or length(last_name) <= 100),

  -- Trimmed by the app; the check stops an untrimmed value creating a
  -- duplicate that looks identical to a human.
  email extensions.citext
    check (
      email is null
      or (email::text = btrim(email::text)
          and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    ),

  -- E.164 where libphonenumber could parse it, raw input otherwise.
  phone text check (phone is null or length(phone) <= 50),

  job_title text check (job_title is null or length(job_title) <= 150),
  linkedin_url text check (linkedin_url is null or length(linkedin_url) <= 500),
  notes text check (notes is null or length(notes) <= 10000),

  source public.contact_source not null default 'manual',
  owner_id uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A person needs at least something to be identified by.
  constraint contacts_needs_an_identity check (
    coalesce(btrim(first_name), '') <> ''
    or coalesce(btrim(last_name), '') <> ''
    or email is not null
  ),

  -- Cross-tenant link prevention, plus PostgREST gets its relationship.
  constraint contacts_company_same_org
    foreign key (organization_id, company_id)
    references public.companies (organization_id, id)
    on delete set null (company_id)
);

-- Dedupe guarantee. Partial, so any number of contacts may have no email —
-- a plain unique index would allow only one NULL-free row per org.
create unique index contacts_org_email_uniq
  on public.contacts (organization_id, email)
  where email is not null;

create index contacts_org_created_idx on public.contacts (organization_id, created_at desc);
create index contacts_org_company_idx on public.contacts (organization_id, company_id)
  where company_id is not null;
create index contacts_org_owner_idx on public.contacts (organization_id, owner_id);
create index contacts_org_phone_idx on public.contacts (organization_id, phone)
  where phone is not null;

-- Fuzzy name matching for dedupe (Phase 3) and global search (Phase 7).
create index contacts_name_trgm_idx on public.contacts
  using gin ((coalesce(first_name, '') || ' ' || coalesce(last_name, '')) extensions.gin_trgm_ops);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger contacts_validate_owner
  before insert or update of owner_id, organization_id on public.contacts
  for each row execute function public.validate_owner_is_member();

alter table public.contacts enable row level security;

create policy "members can read contacts"
  on public.contacts for select to authenticated
  using (public.is_org_member(organization_id));

create policy "members can create contacts"
  on public.contacts for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy "members can update contacts"
  on public.contacts for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "members can delete contacts"
  on public.contacts for delete to authenticated
  using (public.is_org_member(organization_id));

comment on constraint contacts_company_same_org on public.contacts is
  'Composite FK: a contact can only link to a company in its own organization.';
