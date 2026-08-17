-- RLS performance: replace per-row function calls with a hashed set lookup.
--
-- The Phase 1 policies were written as `is_org_member(organization_id)`. That is
-- correct but Postgres cannot hoist it: the function is invoked once per
-- candidate row. Measured on 10,000 contacts (Postgres 17, this project):
--
--     count(*)                212 ms  ->    7 ms
--     limit 50 offset 9950    222 ms  ->  8.5 ms
--
-- Writing the policy as `organization_id in (select my_organization_ids())`
-- lets the planner evaluate the set once and hash-probe it per row —
-- `Filter: (ANY (organization_id = (hashed SubPlan 1).col1))` in the plan.
--
-- Applied uniformly rather than only to the big tables, so the fast pattern is
-- the one that gets copied when Phases 4–6 add deals, activities and tasks.
-- The scalar is_org_*() helpers stay: they are still the right tool inside
-- RPCs, where they are called once per request rather than once per row.

create or replace function public.my_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid());
$$;

create or replace function public.my_admin_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'admin');
$$;

create or replace function public.my_owner_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.role = 'owner';
$$;

revoke all on function public.my_organization_ids() from public, anon;
revoke all on function public.my_admin_organization_ids() from public, anon;
revoke all on function public.my_owner_organization_ids() from public, anon;
grant execute on function public.my_organization_ids() to authenticated;
grant execute on function public.my_admin_organization_ids() to authenticated;
grant execute on function public.my_owner_organization_ids() to authenticated;

-- ------------------------------------------------------------ organizations

drop policy if exists "members can read their organization" on public.organizations;
drop policy if exists "admins can update their organization" on public.organizations;
drop policy if exists "owners can delete their organization" on public.organizations;

create policy "members can read their organization"
  on public.organizations for select to authenticated
  using (id in (select public.my_organization_ids()));

create policy "admins can update their organization"
  on public.organizations for update to authenticated
  using (id in (select public.my_admin_organization_ids()))
  with check (id in (select public.my_admin_organization_ids()));

create policy "owners can delete their organization"
  on public.organizations for delete to authenticated
  using (id in (select public.my_owner_organization_ids()));

-- ----------------------------------------------------- organization_members

drop policy if exists "members can see co-members" on public.organization_members;
drop policy if exists "admins can add members" on public.organization_members;
drop policy if exists "admins can change roles" on public.organization_members;
drop policy if exists "admins can remove members, members can leave" on public.organization_members;

create policy "members can see co-members"
  on public.organization_members for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

create policy "admins can add members"
  on public.organization_members for insert to authenticated
  with check (organization_id in (select public.my_admin_organization_ids()));

create policy "admins can change roles"
  on public.organization_members for update to authenticated
  using (organization_id in (select public.my_admin_organization_ids()))
  with check (organization_id in (select public.my_admin_organization_ids()));

create policy "admins can remove members, members can leave"
  on public.organization_members for delete to authenticated
  using (
    organization_id in (select public.my_admin_organization_ids())
    or user_id = (select auth.uid())
  );

-- -------------------------------------------------------------- invitations

drop policy if exists "admins can read invitations" on public.invitations;
drop policy if exists "admins can revoke invitations" on public.invitations;
drop policy if exists "admins can delete invitations" on public.invitations;

create policy "admins can read invitations"
  on public.invitations for select to authenticated
  using (organization_id in (select public.my_admin_organization_ids()));

create policy "admins can revoke invitations"
  on public.invitations for update to authenticated
  using (organization_id in (select public.my_admin_organization_ids()))
  with check (organization_id in (select public.my_admin_organization_ids()));

create policy "admins can delete invitations"
  on public.invitations for delete to authenticated
  using (organization_id in (select public.my_admin_organization_ids()));

-- ---------------------------------------------------------------- companies

drop policy if exists "members can read companies" on public.companies;
drop policy if exists "members can create companies" on public.companies;
drop policy if exists "members can update companies" on public.companies;
drop policy if exists "members can delete companies" on public.companies;

create policy "members can read companies"
  on public.companies for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

create policy "members can create companies"
  on public.companies for insert to authenticated
  with check (organization_id in (select public.my_organization_ids()));

create policy "members can update companies"
  on public.companies for update to authenticated
  using (organization_id in (select public.my_organization_ids()))
  with check (organization_id in (select public.my_organization_ids()));

create policy "members can delete companies"
  on public.companies for delete to authenticated
  using (organization_id in (select public.my_organization_ids()));

-- ----------------------------------------------------------------- contacts

drop policy if exists "members can read contacts" on public.contacts;
drop policy if exists "members can create contacts" on public.contacts;
drop policy if exists "members can update contacts" on public.contacts;
drop policy if exists "members can delete contacts" on public.contacts;

create policy "members can read contacts"
  on public.contacts for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

create policy "members can create contacts"
  on public.contacts for insert to authenticated
  with check (organization_id in (select public.my_organization_ids()));

create policy "members can update contacts"
  on public.contacts for update to authenticated
  using (organization_id in (select public.my_organization_ids()))
  with check (organization_id in (select public.my_organization_ids()));

create policy "members can delete contacts"
  on public.contacts for delete to authenticated
  using (organization_id in (select public.my_organization_ids()));

-- profiles is deliberately left on shares_organization_with(): it holds one row
-- per user, so per-row cost is irrelevant, and the predicate is about people
-- rather than tenants.

comment on function public.my_organization_ids() is
  'Organization ids the current user belongs to. Use in RLS policies as `org_id in (select my_organization_ids())` — the planner hashes it once instead of calling a function per row.';
