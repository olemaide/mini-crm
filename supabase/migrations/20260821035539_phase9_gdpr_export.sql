/*
 * Phase 9 / DSGVO Art. 20: data portability.
 *
 * The whole tenant as one JSON document, self-serve, no support ticket. A German
 * B2B buyer asks for this in the procurement review, and an export that requires
 * a human to run a query is an export that does not exist.
 *
 * `security invoker`, so RLS decides what is readable — the function cannot be
 * turned into a cross-tenant reader even if the membership guard below were
 * wrong. The guard restricts it further to owners and admins: an ordinary member
 * can read these rows one page at a time in the UI, but handing them the entire
 * customer database in one file is an admin decision.
 *
 * `to_jsonb(row)` rather than a hand-listed column set. A column added in a
 * later phase then appears in the export automatically. The alternative fails
 * silently and in the worst direction — an export that quietly omits the field
 * the customer actually asked about.
 */
create or replace function public.export_organization(
  p_organization_id uuid,
  p_limit integer default 20000
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = 'extensions'
as $$
declare
  -- Bounded so one request cannot try to materialise an unbounded document in
  -- a function that has to fit in memory. Truncation is reported, never hidden.
  v_limit integer := least(greatest(coalesce(p_limit, 20000), 1), 100000);
  v_result jsonb;
begin
  if not public.is_org_admin(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  with counts as (
    select
      (select count(*) from public.companies x where x.organization_id = p_organization_id) as companies,
      (select count(*) from public.contacts x where x.organization_id = p_organization_id) as contacts,
      (select count(*) from public.deals x where x.organization_id = p_organization_id) as deals,
      (select count(*) from public.activities x where x.organization_id = p_organization_id) as activities,
      (select count(*) from public.tasks x where x.organization_id = p_organization_id) as tasks,
      (select count(*) from public.import_jobs x where x.organization_id = p_organization_id) as import_jobs
  )
  select jsonb_build_object(
    'format', 'mini-crm-organization-export',
    'formatVersion', 1,
    'exportedAt', now(),
    'rowLimitPerCollection', v_limit,
    'counts', to_jsonb(c),

    'organization', (
      select to_jsonb(x) from public.organizations x where x.id = p_organization_id
    ),

    /*
     * Membership carries no email address. Emails live in auth.users, which
     * PostgREST does not expose, so the API route joins them in with the
     * service-role client — see app/api/export/route.ts. Doing it there rather
     * than widening this function keeps the auth schema out of a function any
     * signed-in admin can call.
     */
    'members', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.user_id)
        from public.organization_members x
       where x.organization_id = p_organization_id
    ), '[]'::jsonb),

    'profiles', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
        from public.profiles p
       where p.id in (
         select m.user_id from public.organization_members m
          where m.organization_id = p_organization_id
       )
    ), '[]'::jsonb),

    'invitations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from public.invitations x
       where x.organization_id = p_organization_id
    ), '[]'::jsonb),

    'pipelines', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from public.pipelines x
       where x.organization_id = p_organization_id
    ), '[]'::jsonb),

    'pipelineStages', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.position, x.id)
        from public.pipeline_stages x
       where x.organization_id = p_organization_id
    ), '[]'::jsonb),

    'companies', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from (
          select * from public.companies
           where organization_id = p_organization_id
           order by created_at, id
           limit v_limit
        ) x
    ), '[]'::jsonb),

    'contacts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from (
          select * from public.contacts
           where organization_id = p_organization_id
           order by created_at, id
           limit v_limit
        ) x
    ), '[]'::jsonb),

    'deals', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from (
          select * from public.deals
           where organization_id = p_organization_id
           order by created_at, id
           limit v_limit
        ) x
    ), '[]'::jsonb),

    -- Newest first: if this one is truncated, the recent history is what a
    -- customer mid-migration actually needs.
    'activities', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.occurred_at desc, x.id desc)
        from (
          select * from public.activities
           where organization_id = p_organization_id
           order by occurred_at desc, id desc
           limit v_limit
        ) x
    ), '[]'::jsonb),

    'tasks', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from (
          select * from public.tasks
           where organization_id = p_organization_id
           order by created_at, id
           limit v_limit
        ) x
    ), '[]'::jsonb),

    'importJobs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from (
          select * from public.import_jobs
           where organization_id = p_organization_id
           order by created_at, id
           limit v_limit
        ) x
    ), '[]'::jsonb),

    'automationSettings', (
      select to_jsonb(x) from public.automation_settings x
       where x.organization_id = p_organization_id
    ),

    /*
     * Saved views are private to one user by RLS, so this collection contains
     * the exporting admin's own views and nobody else's. That is the correct
     * outcome — a colleague's saved filters are their data, not the company's —
     * and it is stated in the export so the omission is not mistaken for a bug.
     */
    'savedViews', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from public.saved_views x
       where x.organization_id = p_organization_id
    ), '[]'::jsonb),

    'subscription', (
      select to_jsonb(x) from public.subscriptions x
       where x.organization_id = p_organization_id
    ),

    'notes', jsonb_build_array(
      'Member email addresses are held in Supabase Auth and are added by the export endpoint, not by this function.',
      'savedViews contains only the exporting user''s own saved views; they are private per user by design.',
      'Collections larger than rowLimitPerCollection are truncated. Compare counts against each array length.'
    )
  )
  into v_result
  from counts c;

  return v_result;
end;
$$;

comment on function public.export_organization(uuid, integer) is
  'DSGVO Art. 20 portability export: the whole tenant as one JSON document. Owners and admins only; security invoker so RLS still applies.';

revoke all on function public.export_organization(uuid, integer) from public, anon;
grant execute on function public.export_organization(uuid, integer) to authenticated;
