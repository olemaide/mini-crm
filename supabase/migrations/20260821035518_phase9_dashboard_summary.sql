/*
 * Phase 9: the dashboard's real numbers.
 *
 * Until now the dashboard rendered fixed sample figures with a "sample data"
 * notice — deliberately, so locale-aware formatting could be verified before
 * the aggregates existed. Everything it needs now does.
 *
 * One round trip, computed in SQL. The alternative — fetching pages of deals and
 * tasks and summing them in JavaScript — is wrong twice over: it is N+1 against
 * the database, and a paginated fetch under-reports the total the moment the
 * tenant outgrows one page, which is exactly when the number starts to matter.
 * Same reasoning as pipeline_board() in Phase 4.
 *
 * Time boundaries arrive as parameters rather than being computed here. "Today"
 * and "this month" depend on the organization's timezone, and that arithmetic
 * already lives in lib/tasks/due.ts (Phase 6). Duplicating it in SQL would give
 * two implementations of the same rule, free to disagree across a DST boundary.
 */
create or replace function public.dashboard_summary(
  p_organization_id uuid,
  p_now timestamptz,
  p_today_end timestamptz,
  p_month_start timestamptz,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
-- Matches pipeline_board(): the tenant tables carry citext and trigram columns,
-- so their operators have to be resolvable. public is qualified explicitly.
set search_path = 'extensions'
as $$
declare
  v_currency char(3);
  v_pipeline uuid;
  v_result jsonb;
begin
  /*
   * RLS would already reduce a foreign tenant's numbers to zeros, so this guard
   * is not the security boundary. It exists so a stale active-org cookie
   * produces a clean error instead of a dashboard confidently reporting that
   * the business has nothing in it.
   */
  if not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select o.currency into v_currency
    from public.organizations o
   where o.id = p_organization_id;

  -- The board the sidebar links to, so the stage breakdown below matches what
  -- the user sees when they click through.
  select p.id into v_pipeline
    from public.pipelines p
   where p.organization_id = p_organization_id
     and p.is_default
   limit 1;

  with open_deals as (
    select d.value_cents, s.probability
      from public.deals d
      join public.pipeline_stages s on s.id = d.stage_id
     where d.organization_id = p_organization_id
       and d.status = 'open'
  ),
  pipeline_totals as (
    select
      count(*)::integer as open_count,
      coalesce(sum(value_cents), 0)::bigint as total_cents,
      -- Weighted by the stage's own probability, in SQL against every open deal.
      coalesce(sum(value_cents * probability / 100), 0)::bigint as weighted_cents
      from open_deals
  ),
  closed_this_month as (
    select
      count(*) filter (where d.status = 'won')::integer as won_count,
      coalesce(sum(d.value_cents) filter (where d.status = 'won'), 0)::bigint as won_cents,
      count(*) filter (where d.status = 'lost')::integer as lost_count
      from public.deals d
     where d.organization_id = p_organization_id
       and d.status in ('won', 'lost')
       and d.closed_at >= p_month_start
       and d.closed_at < p_today_end
  ),
  task_counts as (
    select
      count(*) filter (where t.due_at < p_now)::integer as overdue,
      count(*) filter (where t.due_at >= p_now and t.due_at < p_today_end)::integer as due_today,
      count(*) filter (
        where t.due_at < p_now and p_user_id is not null and t.assignee_id = p_user_id
      )::integer as mine_overdue
      from public.tasks t
     where t.organization_id = p_organization_id
       and t.status = 'open'
  ),
  stage_rows as (
    select
      s.id,
      s.name,
      s.position,
      count(d.id)::integer as deal_count,
      coalesce(sum(d.value_cents), 0)::bigint as total_cents
      from public.pipeline_stages s
      left join public.deals d
        on d.stage_id = s.id
       and d.status = 'open'
     where s.organization_id = p_organization_id
       and v_pipeline is not null
       and s.pipeline_id = v_pipeline
     group by s.id, s.name, s.position
  )
  select jsonb_build_object(
    'currency', coalesce(v_currency, 'EUR'),
    'pipelineId', v_pipeline,
    'openDeals', pt.open_count,
    'pipelineCents', pt.total_cents,
    'weightedCents', pt.weighted_cents,
    'wonThisMonth', cm.won_count,
    'wonThisMonthCents', cm.won_cents,
    'lostThisMonth', cm.lost_count,
    'overdueTasks', tc.overdue,
    'dueTodayTasks', tc.due_today,
    'myOverdueTasks', tc.mine_overdue,
    'contacts', (
      select count(*) from public.contacts c where c.organization_id = p_organization_id
    ),
    'companies', (
      select count(*) from public.companies co where co.organization_id = p_organization_id
    ),
    'members', (
      select count(*) from public.organization_members m
       where m.organization_id = p_organization_id
    ),
    'stages', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id', sr.id,
                   'name', sr.name,
                   'dealCount', sr.deal_count,
                   'totalCents', sr.total_cents
                 )
                 order by sr.position, sr.id
               )
          from stage_rows sr
      ),
      '[]'::jsonb
    ),
    /*
     * The onboarding checklist, derived rather than stored.
     *
     * A `has_imported` flag on the organization would be a second source of
     * truth that drifts the first time someone undoes an import. Each of these
     * is an existence check against a partial or leading index — cheap enough
     * that recomputing beats remembering.
     */
    'checklist', jsonb_build_object(
      'hasContacts', exists (
        select 1 from public.contacts c where c.organization_id = p_organization_id
      ),
      'hasImported', exists (
        select 1 from public.import_jobs j
         where j.organization_id = p_organization_id and j.status = 'completed'
      ),
      'hasDeal', exists (
        select 1 from public.deals d where d.organization_id = p_organization_id
      ),
      'hasTeammate', (
        select count(*) > 1 from public.organization_members m
         where m.organization_id = p_organization_id
      ),
      'hasCompletedTask', exists (
        select 1 from public.tasks t
         where t.organization_id = p_organization_id and t.status = 'completed'
      )
    )
  )
  into v_result
  from pipeline_totals pt, closed_this_month cm, task_counts tc;

  return v_result;
end;
$$;

comment on function public.dashboard_summary(uuid, timestamptz, timestamptz, timestamptz, uuid) is
  'Every dashboard figure in one round trip. Aggregates cover all rows, never a fetched page. Day and month boundaries are passed in from the app so the organization''s timezone rule lives in one place.';

/*
 * "This month" scans deals by close date, which nothing indexed before — the
 * board only ever asked about open deals. Partial, because closed deals are the
 * minority for a healthy tenant and the index should not carry the open ones.
 */
create index deals_org_closed_at_idx
  on public.deals (organization_id, closed_at desc)
  where closed_at is not null;

/*
 * The two task counters filter on status then range-scan due_at. The Phase 6
 * indexes cover the per-assignee sidebar badge; this one covers the org-wide
 * dashboard count, which has no assignee predicate to lead with.
 */
create index tasks_org_open_due_idx
  on public.tasks (organization_id, due_at)
  where status = 'open';

revoke all on function public.dashboard_summary(uuid, timestamptz, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid, timestamptz, timestamptz, timestamptz, uuid) to authenticated;
