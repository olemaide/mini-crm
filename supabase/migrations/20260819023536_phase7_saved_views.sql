/*
 * Saved views: a named filter combination on a list page.
 *
 * The stored value is the query string, not a structured filter tree. That is
 * deliberate — the URL is already the single source of truth for list state
 * (§ Lists and pagination), every filter is already parsed and clamped from it
 * on the way in, and a second representation would need keeping in step with
 * the first for no benefit. Restoring a view is just a navigation.
 *
 * Because the query string is replayed through the same hostile-input parsing
 * as a hand-typed URL, a tampered value can only produce a differently
 * filtered list of rows the user can already see.
 */
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Personal, not shared. Sharing views across a team needs a permission story
  -- and a "someone changed our view" problem; neither belongs in the MVP.
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Which list this belongs to: 'contacts' | 'companies' | 'deals' | 'tasks'.
  resource text not null check (resource in ('contacts', 'companies', 'deals', 'tasks')),

  name text not null check (length(btrim(name)) between 1 and 60),

  -- Everything after the '?', without it. Empty means "the default view".
  query_string text not null default '' check (length(query_string) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Two views on the same list with the same name is a mistake, not a feature.
  constraint saved_views_unique_name unique (user_id, resource, name)
);

create index saved_views_lookup_idx
  on public.saved_views (organization_id, user_id, resource, name);

create trigger saved_views_set_updated_at
  before update on public.saved_views
  for each row execute function public.set_updated_at();

alter table public.saved_views enable row level security;

-- Every policy is scoped to the owner as well as the tenant: a saved view is
-- one person's working set, and a colleague has no reason to read it.
create policy "users read their own saved views"
  on public.saved_views for select to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.my_organization_ids())
  );
create policy "users create their own saved views"
  on public.saved_views for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id in (select public.my_organization_ids())
  );
create policy "users update their own saved views"
  on public.saved_views for update to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.my_organization_ids())
  )
  with check (
    user_id = (select auth.uid())
    and organization_id in (select public.my_organization_ids())
  );
create policy "users delete their own saved views"
  on public.saved_views for delete to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.my_organization_ids())
  );

comment on table public.saved_views is
  'A named query string for one list page, private to one user. Replayed through the same parsing as a hand-typed URL.';
