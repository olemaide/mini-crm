/*
 * Search keys become stored generated columns, and the indexes become
 * tenant-scoped.
 *
 * Measured on 50,000 contacts, the expression-index version took 338 ms for
 * the contacts branch alone — four times the whole budget. Two causes, both
 * structural:
 *
 * 1. A GIN trigram index is lossy, so every candidate row is rechecked against
 *    the original condition. That re-ran search_key() — and therefore the
 *    unaccent dictionary — for all 6,250 candidates, then again for scoring.
 *    Storing the folded text means the recheck is a plain LIKE on a column.
 *
 * 2. organization_id was not in the index, so the bitmap covered matches from
 *    every tenant and the tenant filter was applied afterwards. RLS still made
 *    that safe, but the work was wasted, and it would get worse with every
 *    customer added. btree_gin lets the uuid sit in the same GIN index, so the
 *    scan starts already scoped to one organization.
 *
 * After: 7.9 ms for the same branch, with organization_id inside the index
 * condition.
 */
create extension if not exists btree_gin with schema extensions;

alter table public.contacts
  add column search_name text
    generated always as (
      public.search_key(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    ) stored,
  add column search_email text
    generated always as (public.search_key(email::text)) stored;

alter table public.companies
  add column search_name text generated always as (public.search_key(name)) stored,
  add column search_domain text generated always as (public.search_key(domain::text)) stored;

alter table public.deals
  add column search_title text generated always as (public.search_key(title)) stored;

drop index public.contacts_search_name_idx;
drop index public.contacts_search_email_idx;
drop index public.companies_search_name_idx;
drop index public.companies_search_domain_idx;
drop index public.deals_search_title_idx;
drop index public.contacts_search_name_prefix_idx;
drop index public.contacts_search_email_prefix_idx;
drop index public.companies_search_name_prefix_idx;
drop index public.deals_search_title_prefix_idx;

-- Substring search, scoped to one tenant inside the index itself.
create index contacts_search_name_idx on public.contacts
  using gin (organization_id, search_name extensions.gin_trgm_ops);
create index contacts_search_email_idx on public.contacts
  using gin (organization_id, search_email extensions.gin_trgm_ops);
create index companies_search_name_idx on public.companies
  using gin (organization_id, search_name extensions.gin_trgm_ops);
create index companies_search_domain_idx on public.companies
  using gin (organization_id, search_domain extensions.gin_trgm_ops);
create index deals_search_title_idx on public.deals
  using gin (organization_id, search_title extensions.gin_trgm_ops);

-- Prefix search for one- and two-character needles, where a trigram index has
-- nothing to work with. text_pattern_ops is what makes LIKE 'a%' a range scan.
create index contacts_search_name_prefix_idx on public.contacts
  (organization_id, search_name text_pattern_ops);
create index contacts_search_email_prefix_idx on public.contacts
  (organization_id, search_email text_pattern_ops);
create index companies_search_name_prefix_idx on public.companies
  (organization_id, search_name text_pattern_ops);
create index deals_search_title_prefix_idx on public.deals
  (organization_id, search_title text_pattern_ops);

comment on column public.contacts.search_name is
  'Lower-cased and accent-folded, maintained by Postgres. Stored rather than computed so the lossy GIN recheck is a plain string compare.';
