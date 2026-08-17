/*
 * Counts how many rows in a pending file already exist, so the preview step can
 * say "412 of these 5,000 are already in your CRM" before anything is written.
 *
 * >>> SUPERSEDED by 20260817225038_phase3_fix_citext_search_path.sql for the
 * >>> same citext/search_path reason as the chunk processor. Kept verbatim.
 *
 * Covers the two tiers that are decidable:
 *
 *   Tier 1 — exact email within the organization. Certain, and the import
 *            applies the duplicate policy to it automatically.
 *   Tier 2 — exact normalised phone (E.164). High confidence, advisory only:
 *            two people at a company legitimately share a switchboard number.
 *
 * Tier 3 from the build plan — fuzzy name similarity within the same company —
 * is deliberately NOT implemented. It is a "flag for review" signal and there
 * is no review UI to flag it into; merging duplicates is a Phase 11 feature. A
 * number the user cannot act on is noise. The trigram indexes exist and are
 * used by search; when the merge UI lands, this is where tier 3 attaches.
 */

create or replace function public.preview_import_duplicates(
  p_organization_id uuid,
  p_emails text[] default '{}',
  p_phones text[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_email_matches integer := 0;
  v_phone_matches integer := 0;
  v_sample text[] := '{}';
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if coalesce(array_length(p_emails, 1), 0) > 20000
     or coalesce(array_length(p_phones, 1), 0) > 20000 then
    raise exception 'Too many values' using errcode = '22023';
  end if;

  -- Joining against unnest() rather than `= any(...)` keeps the planner on
  -- contacts_org_email_uniq instead of scanning the table once per value.
  select count(*)::integer,
         coalesce((array_agg(c.email::text order by c.email))[1:20], '{}')
    into v_email_matches, v_sample
    from public.contacts c
    join unnest(p_emails) as e(value) on c.email = e.value::extensions.citext
   where c.organization_id = p_organization_id;

  select count(*)::integer
    into v_phone_matches
    from public.contacts c
    join unnest(p_phones) as p(value) on c.phone = p.value
   where c.organization_id = p_organization_id
     and c.phone is not null;

  return jsonb_build_object(
    'email_matches', coalesce(v_email_matches, 0),
    'phone_matches', coalesce(v_phone_matches, 0),
    'sample', to_jsonb(v_sample)
  );
end;
$$;

revoke all on function public.preview_import_duplicates(uuid, text[], text[]) from public, anon;
grant execute on function public.preview_import_duplicates(uuid, text[], text[]) to authenticated;
