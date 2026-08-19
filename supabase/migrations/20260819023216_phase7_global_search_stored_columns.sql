/*
 * One query behind the ⌘K palette: contacts, companies and deals together.
 *
 * Matching rule, and why there are two of them:
 *
 *   needle >= 3 characters  ->  LIKE '%needle%', accelerated by the GIN
 *                               trigram indexes. Finds `Müller` inside
 *                               `Anna Müller`, and tolerates typing the
 *                               surname first.
 *   needle < 3 characters   ->  LIKE 'needle%' against the btree prefix
 *                               indexes. A trigram index cannot help with one
 *                               or two characters — there are not enough
 *                               trigrams — and a bare `%ab%` over 50,000 rows
 *                               is a sequential scan.
 *
 * Both sides of every comparison are folded by search_key(): the stored
 * columns when they were generated, the needle on the way in. Case and accents
 * therefore cannot disagree.
 *
 * security invoker: RLS is the tenant boundary. A caller who is not a member
 * of p_organization_id simply matches nothing, with no separate check to keep
 * in step — verified by passing another tenant's id and getting zero rows.
 */
create or replace function public.global_search(
  p_organization_id uuid,
  p_query text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_needle text := public.search_key(p_query);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_pattern text;
  v_items jsonb;
begin
  -- One character matches most of the database; that is noise, not a search.
  if length(v_needle) < 2 then
    return jsonb_build_object('items', '[]'::jsonb, 'query', v_needle, 'tooShort', true);
  end if;

  v_pattern := case
    when length(v_needle) < 3 then v_needle || '%'
    else '%' || v_needle || '%'
  end;

  with matches as (
    select
      'contact' as kind,
      c.id,
      btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as label,
      coalesce(c.email::text, '') as sublabel,
      jsonb_strip_nulls(jsonb_build_object('companyName', co.name)) as extra,
      greatest(
        -- Exact beats prefix beats fuzzy. word_similarity scores the best
        -- matching run of words, so a surname mid-string still ranks properly.
        case
          when c.search_name = v_needle then 1.0
          when c.search_name like v_needle || '%' then 0.9
          else 0.35 + 0.5 * extensions.word_similarity(v_needle, c.search_name)
        end,
        case
          when c.search_email = v_needle then 1.0
          when c.search_email like v_needle || '%' then 0.88
          else 0
        end
      )::real as score
    from public.contacts c
    left join public.companies co on co.id = c.company_id
    where c.organization_id = p_organization_id
      and (c.search_name like v_pattern or c.search_email like v_pattern)

    union all

    -- Contacts reachable through their employer's name, so typing "Nordwind"
    -- surfaces the people there and not only the company record.
    select
      'contact', c.id,
      btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
      coalesce(c.email::text, ''),
      jsonb_strip_nulls(jsonb_build_object('companyName', co.name)),
      0.5::real
    from public.contacts c
    join public.companies co on co.id = c.company_id
    where c.organization_id = p_organization_id
      and co.organization_id = p_organization_id
      and co.search_name like v_pattern

    union all

    select
      'company', co.id, co.name, coalesce(co.domain::text, ''),
      '{}'::jsonb,
      greatest(
        case
          when co.search_name = v_needle then 1.0
          when co.search_name like v_needle || '%' then 0.9
          else 0.35 + 0.5 * extensions.word_similarity(v_needle, co.search_name)
        end,
        case
          when co.search_domain = v_needle then 1.0
          when co.search_domain like v_needle || '%' then 0.88
          else 0
        end
      )::real
    from public.companies co
    where co.organization_id = p_organization_id
      and (co.search_name like v_pattern or co.search_domain like v_pattern)

    union all

    select
      'deal', d.id, d.title,
      coalesce(s.name, ''),
      -- Raw cents; the client formats them in the viewer's locale with the
      -- organization's currency.
      jsonb_build_object('valueCents', d.value_cents, 'currency', d.currency, 'status', d.status),
      case
        when d.search_title = v_needle then 1.0
        when d.search_title like v_needle || '%' then 0.9
        else 0.35 + 0.5 * extensions.word_similarity(v_needle, d.search_title)
      end::real
    from public.deals d
    left join public.pipeline_stages s on s.id = d.stage_id
    where d.organization_id = p_organization_id
      and d.search_title like v_pattern
  ),
  ranked as (
    -- A contact can match on its own name and on its employer's; keep the
    -- better of the two rather than listing it twice.
    select distinct on (kind, id) kind, id, score, label, sublabel, extra
      from matches
     order by kind, id, score desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind', kind, 'id', id, 'label', label, 'sublabel', sublabel,
        'score', score, 'extra', extra
      )
      order by score desc, label asc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select * from ranked order by score desc, label asc limit v_limit
  ) top;

  return jsonb_build_object('items', v_items, 'query', v_needle);
end;
$$;

revoke all on function public.global_search(uuid, text, integer) from public, anon;
grant execute on function public.global_search(uuid, text, integer) to authenticated;
