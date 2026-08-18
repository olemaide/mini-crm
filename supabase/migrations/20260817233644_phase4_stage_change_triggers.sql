-- Stage history and the side effects of moving a card.
--
-- All of this lives in triggers rather than in the Server Action that performs
-- the drag. A deal's stage can change from the board, the deal detail page, a
-- bulk action, an import, or a future automation; putting the bookkeeping in
-- application code means one forgotten path silently breaks the audit trail
-- forever. A trigger cannot be forgotten.

create table public.deal_stage_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index deal_stage_history_deal_idx
  on public.deal_stage_history (deal_id, changed_at desc);
create index deal_stage_history_org_idx
  on public.deal_stage_history (organization_id, changed_at desc);

alter table public.deal_stage_history enable row level security;

-- Read-only from the application's point of view: rows are written by the
-- trigger, which runs as the table owner and is not subject to these policies.
-- No insert/update/delete policy means a client delete matches zero rows.
create policy "members can read stage history"
  on public.deal_stage_history for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

/*
 * Derives status, closing date and stage_entered_at from the target stage.
 *
 * The is_won / is_lost flags on the stage are the single source of truth for
 * whether a deal is closed. Dragging a card into "Won" is the same action as
 * marking it won — there is no second place to keep in sync.
 */
create or replace function public.sync_deal_stage_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_won boolean;
  v_is_lost boolean;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select s.is_won, s.is_lost into v_is_won, v_is_lost
    from public.pipeline_stages s
   where s.id = new.stage_id;

  if tg_op = 'UPDATE' then
    new.stage_entered_at := now();
  end if;

  if coalesce(v_is_won, false) then
    new.status := 'won';
    new.closed_at := coalesce(new.closed_at, now());
    new.lost_reason := null;
  elsif coalesce(v_is_lost, false) then
    new.status := 'lost';
    new.closed_at := coalesce(new.closed_at, now());
  else
    -- Moved back into the open part of the board: the deal is live again, and
    -- a stale loss reason would be actively misleading.
    new.status := 'open';
    new.closed_at := null;
    new.lost_reason := null;
  end if;

  return new;
end;
$$;

create or replace function public.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_history (
      organization_id, deal_id, from_stage_id, to_stage_id, changed_by
    )
    values (new.organization_id, new.id, null, new.stage_id, (select auth.uid()));
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.deal_stage_history (
      organization_id, deal_id, from_stage_id, to_stage_id, changed_by
    )
    values (new.organization_id, new.id, old.stage_id, new.stage_id, (select auth.uid()));
  end if;

  return null;
end;
$$;

create trigger deals_sync_stage_state
  before insert or update of stage_id on public.deals
  for each row execute function public.sync_deal_stage_state();

create trigger deals_record_stage_change
  after insert or update of stage_id on public.deals
  for each row execute function public.record_deal_stage_change();

revoke all on function public.sync_deal_stage_state() from public, anon, authenticated;
revoke all on function public.record_deal_stage_change() from public, anon, authenticated;

comment on table public.deal_stage_history is
  'Append-only. Written by trigger; no write policies exist, so history cannot be forged or erased.';
