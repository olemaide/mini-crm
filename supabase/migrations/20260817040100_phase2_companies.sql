-- Companies.
--
-- A first-class object, not a text field on the contact (B2B decision,
-- 2026-08-17). Deals may hang off a company with no contact yet, and CSV import
-- auto-links contacts to companies by domain.
--
-- NOTE: the RLS policies created here are replaced later in
-- 20260817040300_phase2_rls_set_based_policies.sql for performance. They are
-- kept in this file so the migration is self-consistent when replayed.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null check (length(btrim(name)) between 1 and 200),

  -- citext so 'Example.com' and 'example.com' are the same company. Stored
  -- bare: no protocol, no www, no path — the app normalises before writing and
  -- the check keeps a stray paste from getting in.
  domain extensions.citext
    check (domain is null or domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),

  industry text check (industry is null or length(industry) <= 100),
  website text check (website is null or length(website) <= 500),
  phone text check (phone is null or length(phone) <= 50),

  address_line1 text check (address_line1 is null or length(address_line1) <= 200),
  postal_code text check (postal_code is null or length(postal_code) <= 20),
  city text check (city is null or length(city) <= 100),
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),

  notes text check (notes is null or length(notes) <= 10000),

  -- References profiles rather than auth.users: same integrity, and it gives
  -- PostgREST the foreign key it needs to embed the owner's name in one query.
  owner_id uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Target for the composite foreign key on contacts. Makes it structurally
  -- impossible for a contact in org A to reference a company in org B.
  unique (organization_id, id)
);

create index companies_org_created_idx on public.companies (organization_id, created_at desc);
create index companies_org_name_idx on public.companies (organization_id, name);
create index companies_org_owner_idx on public.companies (organization_id, owner_id);
create index companies_org_domain_idx on public.companies (organization_id, domain)
  where domain is not null;

-- Fuzzy name matching for dedupe (Phase 3) and global search (Phase 7).
create index companies_name_trgm_idx on public.companies
  using gin (name extensions.gin_trgm_ops);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger companies_validate_owner
  before insert or update of owner_id, organization_id on public.companies
  for each row execute function public.validate_owner_is_member();

alter table public.companies enable row level security;

create policy "members can read companies"
  on public.companies for select to authenticated
  using (public.is_org_member(organization_id));

create policy "members can create companies"
  on public.companies for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy "members can update companies"
  on public.companies for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "members can delete companies"
  on public.companies for delete to authenticated
  using (public.is_org_member(organization_id));

comment on column public.companies.domain is
  'Bare domain, lowercase, no protocol or www. Used to auto-link contacts during import.';
