-- Tasks appear in the feed of whatever they are attached to.
--
-- Same reasoning as every other system activity: written by trigger, so a task
-- completed from the /tasks list, a record widget or a future bulk action all
-- produce the same feed entry. A task with no linked record writes nothing,
-- because activities require exactly one subject and there is nowhere to put it.

create or replace function public.record_tasks_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (
    organization_id, type, contact_id, company_id, deal_id, actor_id, metadata
  )
  select
    n.organization_id, 'task_created',
    n.contact_id, n.company_id, n.deal_id,
    coalesce(n.created_by, (select auth.uid())),
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', n.id,
      'title', n.title,
      'due_at', n.due_at,
      'auto', nullif(n.is_auto_generated, false),
      'source_rule', n.source_rule
    ))
  from new_rows n
  where num_nonnulls(n.contact_id, n.company_id, n.deal_id) = 1;

  return null;
end;
$$;

/*
 * Note the trigger below has no `of status` column list.
 *
 * Postgres refuses transition tables on a trigger with one, so the "did it
 * actually become completed" test lives in the WHERE clause instead. The
 * trigger therefore fires on every task update and filters — which is also
 * more robust, since a status change routed through some future column would
 * still be caught.
 */
create or replace function public.record_tasks_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (
    organization_id, type, contact_id, company_id, deal_id, actor_id, metadata
  )
  select
    n.organization_id, 'task_completed',
    n.contact_id, n.company_id, n.deal_id,
    (select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', n.id,
      'title', n.title,
      'due_at', n.due_at,
      'auto', nullif(n.is_auto_generated, false)
    ))
  from new_rows n
  join old_rows o on o.id = n.id
  where num_nonnulls(n.contact_id, n.company_id, n.deal_id) = 1
    -- Only the transition into completed. Re-saving a completed task, or
    -- editing its title afterwards, must not add a second line to the feed.
    and o.status is distinct from 'completed'
    and n.status = 'completed';

  return null;
end;
$$;

create trigger tasks_record_created
  after insert on public.tasks
  referencing new table as new_rows
  for each statement execute function public.record_tasks_created();

create trigger tasks_record_completed
  after update on public.tasks
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.record_tasks_completed();

revoke all on function public.record_tasks_created() from public, anon, authenticated;
revoke all on function public.record_tasks_completed() from public, anon, authenticated;
