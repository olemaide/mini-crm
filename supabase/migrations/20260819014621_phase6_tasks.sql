-- Follow-up tasks.
--
-- Overdue is NEVER stored. A task is overdue when `status = 'open' and due_at <
-- now()`, and that is evaluated at read time, every time. An `is_overdue`
-- column would be correct for exactly as long as it took the clock to move.

create type public.task_status as enum ('open', 'completed', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  title text not null check (length(btrim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 5000),

  -- Nullable on purpose: "call them back at some point" is a real task, and
  -- forcing a date makes people invent one.
  due_at timestamptz,

  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',

  -- profiles, not auth.users: the app needs the display name, and PostgREST
  -- needs a direct foreign key to embed it (the lesson from Phase 1).
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,

  contact_id uuid,
  company_id uuid,
  deal_id uuid,

  is_auto_generated boolean not null default false,
  source_rule text check (source_rule is null or length(source_rule) <= 100),

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
   * At most one linked record — zero is allowed, unlike activities.
   *
   * A standalone "renew the domain" task belongs to nobody in particular, but
   * a task attached to two records would appear twice in the roll-up widget and
   * would have no single subject to write its feed activity against.
   */
  constraint tasks_at_most_one_link
    check (num_nonnulls(contact_id, company_id, deal_id) <= 1),

  -- Cross-tenant links are structurally impossible, as everywhere else.
  constraint tasks_contact_same_org
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint tasks_company_same_org
    foreign key (organization_id, company_id)
    references public.companies (organization_id, id) on delete cascade,
  constraint tasks_deal_same_org
    foreign key (organization_id, deal_id)
    references public.deals (organization_id, id) on delete cascade,

  -- Status and completed_at cannot disagree. Kept honest by a trigger too, so
  -- callers never have to set it by hand.
  constraint tasks_completed_at_matches_status check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

/*
 * The overdue / today / upcoming queries, which are the whole page.
 *
 * Partial on `status = 'open'`: completed tasks are the majority of the table
 * within a month of launch and are never in these lists. `id` last gives the
 * total order that pagination needs to stay stable, and `due_at` sorts nulls
 * last by default in ascending order, which is exactly the "no due date sinks
 * to the bottom" rule.
 */
create index tasks_open_due_idx
  on public.tasks (organization_id, due_at, id)
  where status = 'open';

-- "My tasks" is the default filter, so it gets its own index.
create index tasks_open_assignee_due_idx
  on public.tasks (organization_id, assignee_id, due_at, id)
  where status = 'open';

-- The Completed tab looks back 30 days.
create index tasks_completed_idx
  on public.tasks (organization_id, completed_at desc)
  where status = 'completed';

-- Widgets on the record pages.
create index tasks_contact_idx on public.tasks (organization_id, contact_id, due_at)
  where contact_id is not null;
create index tasks_company_idx on public.tasks (organization_id, company_id, due_at)
  where company_id is not null;
create index tasks_deal_idx on public.tasks (organization_id, deal_id, due_at)
  where deal_id is not null;

-- Covering indexes for the ON DELETE SET NULL scans when a profile is removed.
create index tasks_assignee_idx on public.tasks (assignee_id) where assignee_id is not null;
create index tasks_created_by_idx on public.tasks (created_by) where created_by is not null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger tasks_validate_assignee
  before insert or update of assignee_id, organization_id on public.tasks
  for each row execute function public.validate_owner_is_member();

/*
 * Keeps completed_at in step with status.
 *
 * Completing a task is a checkbox in three different places, and re-opening
 * one has to clear the timestamp or the Completed tab keeps showing it. Doing
 * this in the database means no caller can get the pair out of step, and the
 * check constraint above can stay strict.
 */
create or replace function public.sync_task_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' then
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
  before insert or update of status on public.tasks
  for each row execute function public.sync_task_completion();

alter table public.tasks enable row level security;

-- Everyone in the organization can see and manage the team's tasks. A sales
-- team of five has no use for per-user task privacy, and hiding a colleague's
-- follow-ups is how things get dropped when someone is on holiday.
create policy "members can read tasks"
  on public.tasks for select to authenticated
  using (organization_id in (select public.my_organization_ids()));
create policy "members can create tasks"
  on public.tasks for insert to authenticated
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can update tasks"
  on public.tasks for update to authenticated
  using (organization_id in (select public.my_organization_ids()))
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can delete tasks"
  on public.tasks for delete to authenticated
  using (organization_id in (select public.my_organization_ids()));

revoke all on function public.sync_task_completion() from public, anon, authenticated;

comment on table public.tasks is
  'Follow-ups. Overdue is computed at read time from status + due_at, never stored.';
comment on column public.tasks.due_at is
  'UTC instant. Rendered and compared in the organization timezone — see lib/tasks/due.ts.';
comment on column public.tasks.title is
  'Stored text in whatever language it was written. The automation seed is localized once, at creation; nothing re-translates it afterwards.';
