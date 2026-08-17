-- Row Level Security for the tenancy tables.
--
-- Note what is deliberately absent: there is no INSERT policy on
-- organizations. Organizations can only be created through
-- public.create_organization(), which also installs the first owner in the
-- same transaction. That makes an ownerless organization unrepresentable
-- rather than merely unlikely.

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------- organizations

create policy "members can read their organization"
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

create policy "admins can update their organization"
  on public.organizations for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy "owners can delete their organization"
  on public.organizations for delete to authenticated
  using (public.is_org_owner(id));

-- ---------------------------------------------------- organization_members

create policy "members can see co-members"
  on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));

create policy "admins can add members"
  on public.organization_members for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy "admins can change roles"
  on public.organization_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Admins can remove others; anyone can remove themselves (leave the org).
-- The last-owner guard trigger still applies on top of this.
create policy "admins can remove members, members can leave"
  on public.organization_members for delete to authenticated
  using (
    public.is_org_admin(organization_id)
    or user_id = (select auth.uid())
  );

-- ------------------------------------------------------------------ profiles

create policy "read own profile and teammates"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.shares_organization_with(id)
  );

-- The trigger on auth.users normally creates this row; the policy exists so a
-- self-repair upsert from the app is possible without the service-role key.
create policy "insert own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
