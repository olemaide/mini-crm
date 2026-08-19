/*
 * Tasks need their own assignee guard.
 *
 * phase6_tasks reused validate_owner_is_member(), which reads `new.owner_id`
 * by name — a column tasks do not have. Every insert failed with "record new
 * has no field owner_id" the moment the trigger fired. The generic function is
 * left alone because contacts, companies and deals all genuinely use owner_id;
 * duplicating four lines is better than making it introspect column names.
 */
drop trigger tasks_validate_assignee on public.tasks;

create or replace function public.validate_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and not exists (
       select 1
       from public.organization_members m
       where m.organization_id = new.organization_id
         and m.user_id = new.assignee_id
     )
  then
    raise exception 'Assignee is not a member of this organization' using errcode = 'P0005';
  end if;

  return new;
end;
$$;

create trigger tasks_validate_assignee
  before insert or update of assignee_id, organization_id on public.tasks
  for each row execute function public.validate_task_assignee();

revoke all on function public.validate_task_assignee() from public, anon, authenticated;
