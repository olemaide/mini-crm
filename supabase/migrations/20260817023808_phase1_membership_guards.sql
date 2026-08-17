-- Invariants that RLS cannot express.
--
-- An RLS policy answers "may this user touch this row". It cannot answer "does
-- this change leave the organization in a valid state" — that needs to see the
-- rest of the table. Two rules live here:
--
--   1. An organization always has at least one owner. Otherwise nobody can
--      manage billing or delete the org, and support has to fix it by hand.
--   2. Only an owner grants or revokes ownership. Without this an admin could
--      simply promote themselves, making the role distinction decorative.

create or replace function public.guard_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_owner_count integer;
  v_member_count integer;
begin
  -- No JWT means a service-role or server-side caller, which has already
  -- bypassed RLS to reach this point. Trusting it here is deliberate; the
  -- narrow set of such call sites is documented in lib/supabase/admin.ts.
  if v_actor is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- ---------------------------------------------- privilege escalation

  if tg_op = 'INSERT' and new.role = 'owner' then
    select count(*) into v_member_count
      from public.organization_members
     where organization_id = new.organization_id;

    -- The first member of a brand-new organization is its owner by
    -- definition; create_organization() relies on this branch.
    if v_member_count > 0 and not public.is_org_owner(new.organization_id) then
      raise exception 'Only an owner can grant the owner role'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and (new.role = 'owner' or old.role = 'owner')
     and not public.is_org_owner(old.organization_id) then
    raise exception 'Only an owner can grant or revoke the owner role'
      using errcode = '42501';
  end if;

  -- ---------------------------------------------- last owner standing

  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner')
  then
    select count(*) into v_owner_count
      from public.organization_members
     where organization_id = old.organization_id
       and role = 'owner';

    if v_owner_count <= 1 then
      raise exception 'An organization must always have at least one owner'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger organization_members_guard
  before insert or update or delete on public.organization_members
  for each row execute function public.guard_membership_changes();
