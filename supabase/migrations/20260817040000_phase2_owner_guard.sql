-- Reusable guard: a record's owner must belong to the record's organization.
--
-- RLS answers "may this user touch this row"; it says nothing about whether the
-- *values* being written are coherent. Without this, a crafted request could
-- set owner_id to any UUID — including a user from another tenant. Nothing
-- leaks (they still cannot read the row), but the data is quietly corrupt and
-- the owner filter starts returning nonsense.
--
-- Attached to contacts and companies now; deals and tasks reuse it in Phases 4
-- and 6.

create or replace function public.validate_owner_is_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is not null
     and not exists (
       select 1
       from public.organization_members m
       where m.organization_id = new.organization_id
         and m.user_id = new.owner_id
     )
  then
    raise exception 'The assigned owner is not a member of this organization'
      using errcode = 'P0005';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_owner_is_member() from public, anon, authenticated;

comment on function public.validate_owner_is_member() is
  'BEFORE INSERT OR UPDATE trigger: rejects an owner_id that is not a member of the row''s organization.';
