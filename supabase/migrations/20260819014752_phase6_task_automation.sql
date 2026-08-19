/*
 * "+N business days at 09:00, in the organization's timezone."
 *
 * The conversion is deliberately done via `date` in local time rather than by
 * adding an interval to a timestamptz. `now() + interval '1 day'` adds exactly
 * 24 hours, which lands on 08:00 or 10:00 across a DST boundary — the classic
 * "due tomorrow" bug the build plan warns about. Going through the local
 * calendar date and re-anchoring at 09:00 gives 09:00 local on both sides.
 *
 * 09:00 is also chosen because it always exists: Europe/Berlin's spring-forward
 * skips 02:00-03:00, so an hour inside that window would be undefined twice a
 * year. Public holidays are explicitly out of scope for the MVP.
 *
 * stable, not immutable: timezone definitions can change under us.
 */
create or replace function public.next_business_due_at(
  p_from timestamptz,
  p_timezone text,
  p_offset_days integer default 1,
  p_hour integer default 9
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date date := (p_from at time zone p_timezone)::date + greatest(coalesce(p_offset_days, 1), 0);
  v_guard integer := 0;
begin
  -- Saturday and Sunday are not follow-up days.
  while extract(isodow from v_date) in (6, 7) and v_guard < 7 loop
    v_date := v_date + 1;
    v_guard := v_guard + 1;
  end loop;

  return (v_date + make_time(p_hour, 0, 0)) at time zone p_timezone;
end;
$$;

/*
 * Automation rule 1: a follow-up task when a lead lands.
 *
 * Fires only for deals created in the FIRST stage of their pipeline. A deal
 * dropped straight into "Proposal" is already a conversation in progress and
 * does not need a "make first contact" reminder.
 *
 * Statement-level with a transition table, for the reason established in
 * Phase 5: a bulk insert then costs one statement instead of one per row.
 */
create or replace function public.create_lead_follow_up_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * The bulk-import escape hatch.
   *
   * A run that creates 500 deals must not also create 500 tasks unless the
   * user asked for it. The flag is a transaction-local GUC, so it can only be
   * set by server-side code inside the importing transaction — a browser
   * cannot reach it through PostgREST. Absent means "create the task", which
   * is the right default for the ordinary path of a person adding one deal.
   */
  if coalesce(current_setting('app.suppress_task_automation', true), '') = 'on' then
    return null;
  end if;

  insert into public.tasks (
    organization_id, title, due_at, assignee_id, created_by,
    deal_id, is_auto_generated, source_rule
  )
  select
    d.organization_id,
    -- Placeholders resolve against the deal's own links. If the template
    -- collapses to nothing, fall back to the deal title rather than failing
    -- the check constraint and taking the deal creation down with it.
    coalesce(
      nullif(
        btrim(
          left(
            replace(
              replace(
                replace(s.lead_task_title, '{{deal_title}}', coalesce(d.title, '')),
                '{{contact_name}}',
                btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
              ),
              '{{company_name}}', coalesce(co.name, '')
            ),
            200
          )
        ),
        ''
      ),
      d.title
    ),
    public.next_business_due_at(now(), o.timezone, s.lead_task_offset_days),
    -- The person who will actually do it, falling back to whoever created it.
    coalesce(d.owner_id, (select auth.uid())),
    (select auth.uid()),
    d.id,
    true,
    'lead_created'
  from new_rows d
  join public.automation_settings s on s.organization_id = d.organization_id
  join public.organizations o on o.id = d.organization_id
  left join public.contacts c on c.id = d.contact_id
  left join public.companies co on co.id = d.company_id
  where s.lead_task_enabled
    and d.stage_id = (
      select ps.id
        from public.pipeline_stages ps
       where ps.pipeline_id = d.pipeline_id
       order by ps.position, ps.id
       limit 1
    );

  return null;
end;
$$;

create trigger deals_create_lead_task
  after insert on public.deals
  referencing new table as new_rows
  for each statement execute function public.create_lead_follow_up_tasks();

revoke all on function public.create_lead_follow_up_tasks() from public, anon, authenticated;
revoke all on function public.next_business_due_at(timestamptz, text, integer, integer)
  from public, anon;
grant execute on function public.next_business_due_at(timestamptz, text, integer, integer)
  to authenticated;
