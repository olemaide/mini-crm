/*
 * completed_at becomes fully derived, not merely defaulted.
 *
 * The trigger was `before insert or update of status`, so it only ran when
 * `status` appeared in the UPDATE's column list. An update touching only
 * `completed_at` slipped past it, and the client's value was written verbatim
 * — a member could backdate a completion and make a follow-up they finished
 * last week look like it was done on time. Sales teams are measured on exactly
 * that, so it is worth closing.
 *
 * Dropping the column list makes the trigger fire on every update, and the
 * value is then always recomputed from `status`: kept if the task was already
 * completed, stamped on the transition, cleared otherwise. Whatever a caller
 * sends in `completed_at` is discarded.
 */
drop trigger tasks_sync_completion on public.tasks;

create or replace function public.sync_task_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    -- Preserve the original moment across later edits; stamp it on the
    -- transition. new.completed_at is deliberately ignored either way.
    new.completed_at := coalesce(
      case when tg_op = 'UPDATE' and old.status = 'completed' then old.completed_at end,
      now()
    );
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_completion
  before insert or update on public.tasks
  for each row execute function public.sync_task_completion();

comment on column public.tasks.completed_at is
  'Derived from status by trigger on every write. Client-supplied values are ignored — it cannot be backdated.';
