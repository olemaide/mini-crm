-- Shared updated_at trigger.
--
-- Attached to every table that has an updated_at column. Written once here so
-- no table has to remember to do it, and so the behaviour cannot drift between
-- tables.
--
-- search_path is pinned to '' and every reference is schema-qualified. An
-- unpinned search_path on a function is a privilege-escalation vector and is
-- flagged by Supabase's security advisor.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: stamps updated_at on every UPDATE. Attach as BEFORE UPDATE FOR EACH ROW.';
