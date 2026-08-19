/*
 * The roll-up feed for one record, one page at a time.
 *
 * A deal shows its own activities plus its contact's. A contact shows its own
 * plus those of every deal it is attached to. A company shows its own plus its
 * people's and its deals'. Roll-up lives here, in the read path, because
 * `activities_exactly_one_subject` guarantees the branches are disjoint — so
 * the union needs no de-duplication, which is what makes keyset pagination
 * over it correct.
 *
 * Pagination is keyset on (occurred_at, id), not offset. Offset pagination
 * silently repeats or skips rows the moment someone logs a call while you are
 * scrolling — and this is a feed people scroll while colleagues are working.
 */
create or replace function public.activity_feed(
  p_subject_type text,
  p_subject_id uuid,
  p_types public.activity_type[] default null,
  p_before_occurred_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  -- Sentinels rather than `param is null or ...`: a constant upper bound stays
  -- an index range scan, an OR against a possibly-null parameter does not.
  v_before_at timestamptz := coalesce(p_before_occurred_at, 'infinity'::timestamptz);
  v_before_id bigint := coalesce(p_before_id, 9223372036854775807);
  v_types public.activity_type[] :=
    coalesce(p_types, enum_range(null::public.activity_type));
  v_contact_ids uuid[] := '{}';
  v_company_ids uuid[] := '{}';
  v_deal_ids uuid[] := '{}';
  v_rows jsonb;
  v_items jsonb;
  v_next jsonb;
begin
  -- Every read below is RLS-scoped, so a subject in another tenant simply is
  -- not found — indistinguishable from one that never existed.
  if p_subject_type = 'deal' then
    select d.organization_id, array_remove(array[d.contact_id], null), array[d.id]
      into v_org, v_contact_ids, v_deal_ids
      from public.deals d where d.id = p_subject_id;

  elsif p_subject_type = 'contact' then
    select c.organization_id, array[c.id]
      into v_org, v_contact_ids
      from public.contacts c where c.id = p_subject_id;

    select coalesce(array_agg(d.id), '{}') into v_deal_ids
      from public.deals d where d.contact_id = p_subject_id;

  elsif p_subject_type = 'company' then
    select co.organization_id, array[co.id]
      into v_org, v_company_ids
      from public.companies co where co.id = p_subject_id;

    select coalesce(array_agg(c.id), '{}') into v_contact_ids
      from public.contacts c where c.company_id = p_subject_id;

    select coalesce(array_agg(d.id), '{}') into v_deal_ids
      from public.deals d where d.company_id = p_subject_id;

  else
    raise exception 'Unknown subject type' using errcode = '22023';
  end if;

  if v_org is null then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  -- One branch per subject index. Each is limited before the merge, so the
  -- planner never sorts more than 3 * (limit + 1) rows. Taking the top N of
  -- each disjoint branch and then the top N of the union yields the true top N.
  with branch as (
    (
      select a.id, a.occurred_at
        from public.activities a
       where a.organization_id = v_org
         and a.contact_id = any(v_contact_ids)
         and a.type = any(v_types)
         and (a.occurred_at, a.id) < (v_before_at, v_before_id)
       order by a.occurred_at desc, a.id desc
       limit v_limit + 1
    )
    union all
    (
      select a.id, a.occurred_at
        from public.activities a
       where a.organization_id = v_org
         and a.company_id = any(v_company_ids)
         and a.type = any(v_types)
         and (a.occurred_at, a.id) < (v_before_at, v_before_id)
       order by a.occurred_at desc, a.id desc
       limit v_limit + 1
    )
    union all
    (
      select a.id, a.occurred_at
        from public.activities a
       where a.organization_id = v_org
         and a.deal_id = any(v_deal_ids)
         and a.type = any(v_types)
         and (a.occurred_at, a.id) < (v_before_at, v_before_id)
       order by a.occurred_at desc, a.id desc
       limit v_limit + 1
    )
  ),
  page as (
    select b.id
      from branch b
     order by b.occurred_at desc, b.id desc
     limit v_limit + 1
  )
  -- Labels are resolved only for the page that is actually returned, so the
  -- joins run over at most 26 rows.
  select coalesce(jsonb_agg(row order by row -> 'occurred_at' desc, (row ->> 'id')::bigint desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'id', a.id,
        'type', a.type,
        'body', a.body,
        'metadata', a.metadata,
        'occurred_at', a.occurred_at,
        'created_at', a.created_at,
        'edited_at', a.edited_at,
        'actor', case when p.id is null then null
                 else jsonb_build_object('id', p.id, 'name', p.full_name) end,
        'subject', case
          when a.deal_id is not null then jsonb_build_object(
            'kind', 'deal', 'id', a.deal_id, 'label', d.title)
          when a.contact_id is not null then jsonb_build_object(
            'kind', 'contact', 'id', a.contact_id,
            'label', btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')))
          else jsonb_build_object('kind', 'company', 'id', a.company_id, 'label', co.name)
        end
      ) as row
      from page
      join public.activities a on a.id = page.id
      left join public.profiles p on p.id = a.actor_id
      left join public.deals d on d.id = a.deal_id
      left join public.contacts c on c.id = a.contact_id
      left join public.companies co on co.id = a.company_id
    ) labelled;

  -- The extra row is the existence proof for a next page, not part of it.
  if jsonb_array_length(v_rows) > v_limit then
    v_items := (select jsonb_agg(e) from (
      select e from jsonb_array_elements(v_rows) with ordinality as t(e, n)
       where n <= v_limit
    ) kept);
    v_next := jsonb_build_object(
      'occurred_at', v_rows -> (v_limit - 1) -> 'occurred_at',
      'id', v_rows -> (v_limit - 1) -> 'id'
    );
  else
    v_items := v_rows;
    v_next := null;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

revoke all on function public.activity_feed(text, uuid, public.activity_type[], timestamptz, bigint, integer)
  from public, anon;
grant execute on function public.activity_feed(text, uuid, public.activity_type[], timestamptz, bigint, integer)
  to authenticated;
