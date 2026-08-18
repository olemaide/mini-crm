/*
 * Creates an organization's default pipeline, if it has none.
 *
 * Stage names arrive as a parameter rather than being written into this
 * function, because they are stored text in the organization's language
 * (build plan §1.5 rule 3). The catalogue lives in lib/seed/stages.ts so that
 * adding a third language is a TypeScript change, not a migration.
 *
 * Idempotent, and called lazily by the board page. That covers organizations
 * created before pipelines existed as well as new ones, without a backfill.
 */
create or replace function public.seed_default_pipeline(
  p_organization_id uuid,
  p_name text,
  p_stages jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline uuid;
  v_stage jsonb;
  v_position numeric := 1000;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select id into v_pipeline
    from public.pipelines
   where organization_id = p_organization_id and is_default
   limit 1;

  if v_pipeline is not null then
    return v_pipeline;
  end if;

  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'At least one stage is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_stages) > 20 then
    raise exception 'Too many stages' using errcode = '22023';
  end if;

  insert into public.pipelines (organization_id, name, is_default)
  values (p_organization_id, left(coalesce(nullif(btrim(p_name), ''), 'Pipeline'), 100), true)
  returning id into v_pipeline;

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    insert into public.pipeline_stages (
      organization_id, pipeline_id, name, position, probability, is_won, is_lost
    )
    values (
      p_organization_id,
      v_pipeline,
      left(btrim(v_stage ->> 'name'), 60),
      v_position,
      coalesce((v_stage ->> 'probability')::numeric, 0),
      coalesce((v_stage ->> 'is_won')::boolean, false),
      coalesce((v_stage ->> 'is_lost')::boolean, false)
    );
    -- Gaps of 1000 leave room to insert a stage between two others without
    -- touching either.
    v_position := v_position + 1000;
  end loop;

  return v_pipeline;
end;
$$;

/*
 * The whole board in one round trip.
 *
 * Stages, their aggregates, and the first N cards of each — three things that
 * would otherwise be 1 + 2N queries. The build plan flags the N+1 explicitly as
 * the way this page dies.
 *
 * Aggregates cover EVERY open deal in the stage; cards are capped. Summing the
 * returned cards in JavaScript would silently under-report the pipeline value
 * the moment a column exceeds the card limit — which is exactly when the number
 * starts to matter.
 */
create or replace function public.pipeline_board(
  p_pipeline_id uuid,
  p_owner_id uuid default null,
  p_query text default null,
  p_cards_per_stage integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = 'extensions'
as $$
declare
  v_org uuid;
  v_limit integer := least(greatest(coalesce(p_cards_per_stage, 50), 1), 200);
  v_search text := nullif(btrim(coalesce(p_query, '')), '');
  v_result jsonb;
begin
  -- RLS already scopes this select; a null result means "not yours or gone".
  select organization_id into v_org from public.pipelines where id = p_pipeline_id;
  if v_org is null then
    raise exception 'Pipeline not found' using errcode = 'P0002';
  end if;

  with filtered as (
    select d.*
      from public.deals d
     where d.organization_id = v_org
       and d.pipeline_id = p_pipeline_id
       and d.status = 'open'
       and (p_owner_id is null or d.owner_id = p_owner_id)
       and (v_search is null or d.title ilike '%' || v_search || '%')
  ),
  totals as (
    select f.stage_id,
           count(*)::integer as deal_count,
           coalesce(sum(f.value_cents), 0)::bigint as total_cents,
           coalesce(sum(f.value_cents * s.probability / 100), 0)::bigint as weighted_cents
      from filtered f
      join public.pipeline_stages s on s.id = f.stage_id
     group by f.stage_id
  ),
  ranked as (
    select f.*,
           row_number() over (partition by f.stage_id order by f.position, f.id) as rn
      from filtered f
  ),
  cards as (
    select r.stage_id,
           jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'title', r.title,
               'value_cents', r.value_cents,
               'currency', r.currency,
               'position', r.position,
               'expected_close_date', r.expected_close_date,
               'stage_entered_at', r.stage_entered_at,
               'contact', case when c.id is null then null else jsonb_build_object(
                 'id', c.id,
                 'name', btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
               ) end,
               'company', case when co.id is null then null else jsonb_build_object(
                 'id', co.id, 'name', co.name
               ) end,
               'owner', case when p.id is null then null else jsonb_build_object(
                 'id', p.id, 'name', p.full_name
               ) end
             )
             order by r.position, r.id
           ) as cards
      from ranked r
      left join public.contacts c on c.id = r.contact_id
      left join public.companies co on co.id = r.company_id
      left join public.profiles p on p.id = r.owner_id
     where r.rn <= v_limit
     group by r.stage_id
  )
  select jsonb_build_object(
    'pipeline_id', p_pipeline_id,
    'stages', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'position', s.position,
        'probability', s.probability,
        'is_won', s.is_won,
        'is_lost', s.is_lost,
        'deal_count', coalesce(t.deal_count, 0),
        'total_cents', coalesce(t.total_cents, 0),
        'weighted_cents', coalesce(t.weighted_cents, 0),
        'cards', coalesce(cd.cards, '[]'::jsonb)
      )
      order by s.position, s.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.pipeline_stages s
  left join totals t on t.stage_id = s.id
  left join cards cd on cd.stage_id = s.id
  where s.organization_id = v_org
    and s.pipeline_id = p_pipeline_id;

  return v_result;
end;
$$;

revoke all on function public.seed_default_pipeline(uuid, text, jsonb) from public, anon;
revoke all on function public.pipeline_board(uuid, uuid, text, integer) from public, anon;
grant execute on function public.seed_default_pipeline(uuid, text, jsonb) to authenticated;
grant execute on function public.pipeline_board(uuid, uuid, text, integer) to authenticated;
