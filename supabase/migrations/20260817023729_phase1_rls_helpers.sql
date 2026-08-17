-- Tenant-isolation helpers.
--
-- Every RLS policy in the codebase routes through these. Three properties make
-- them safe and fast, and all three are load-bearing:
--
--   security definer   Bypasses RLS inside the function. Without it, a policy
--                      on organization_members that reads organization_members
--                      recurses infinitely.
--   set search_path='' Pins resolution. An unpinned search_path on a definer
--                      function is a privilege-escalation vector.
--   (select auth.uid())  The subselect makes Postgres evaluate the call once
--                      per statement instead of once per row. On a 10k-row
--                      scan that is the difference between 3 ms and 3 s.

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

-- Returns null when the caller is not a member, which callers must treat as
-- "no access" rather than as a role.
create or replace function public.org_role_of(org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = org
    and m.user_id = (select auth.uid());
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.org_role_of(org) in ('owner', 'admin'), false);
$$;

create or replace function public.is_org_owner(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.org_role_of(org) = 'owner', false);
$$;

-- Used by the profiles read policy so teammates can see each other's names
-- without exposing every profile in the database.
create or replace function public.shares_organization_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user
  );
$$;

comment on function public.is_org_member(uuid) is
  'True when the current user belongs to the organization. The basis of every tenant RLS policy.';
