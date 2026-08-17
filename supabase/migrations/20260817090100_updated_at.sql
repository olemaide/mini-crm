-- Shared updated_at trigger.
--
-- Attached to every table that has an updated_at column. Written once here so
-- no table has to remember to do it, and so the behaviour cannot drift between
-- tables.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: stamps updated_at on every UPDATE. Attach as a BEFORE UPDATE FOR EACH ROW trigger.';
