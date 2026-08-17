-- Re-creates import_contacts_chunk with search_path = 'extensions' so the
-- citext comparisons on contacts.email and companies.domain are actually
-- case-insensitive. See 20260817225038_phase3_fix_citext_search_path.sql for
-- the full explanation; without this, a row spelled ANNA@FIRMA.DE is reported
-- as a constraint error instead of being handled by the duplicate policy.
--
-- This is the authoritative version of the function.

create or replace function public.import_contacts_chunk(
  p_job_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = 'extensions'
as $$
declare
  v_job public.import_jobs;
  v_row jsonb;
  v_row_number integer;
  v_first text;
  v_last text;
  v_email extensions.citext;
  v_phone text;
  v_title text;
  v_linkedin text;
  v_notes text;
  v_company_name text;
  v_company_domain extensions.citext;
  v_company_id uuid;
  v_existing_id uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_error_count integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_msg text;
  v_state text;
  v_code text;
begin
  select * into v_job from public.import_jobs where id = p_job_id;

  if v_job.id is null then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;
  if v_job.status <> 'running' then
    raise exception 'Import is not running' using errcode = 'P0007';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Chunk too large' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_row_number := coalesce((v_row ->> 'row')::integer, 0);

    begin
      -- The application layer marks rows that failed validation rather than
      -- dropping them, so the user gets "row 12: invalid email" instead of a
      -- silently shorter import.
      if v_row ? '_error' then
        raise exception '%', (v_row ->> '_error') using errcode = 'P0009';
      end if;

      v_first          := nullif(btrim(coalesce(v_row ->> 'first_name', '')), '');
      v_last           := nullif(btrim(coalesce(v_row ->> 'last_name', '')), '');
      v_email          := nullif(btrim(coalesce(v_row ->> 'email', '')), '')::extensions.citext;
      v_phone          := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
      v_title          := nullif(btrim(coalesce(v_row ->> 'job_title', '')), '');
      v_linkedin       := nullif(btrim(coalesce(v_row ->> 'linkedin_url', '')), '');
      v_notes          := nullif(btrim(coalesce(v_row ->> 'notes', '')), '');
      v_company_name   := nullif(btrim(coalesce(v_row ->> 'company_name', '')), '');
      v_company_domain := nullif(btrim(coalesce(v_row ->> 'company_domain', '')), '')::extensions.citext;

      if v_first is null and v_last is null and v_email is null then
        raise exception 'missingIdentity' using errcode = 'P0008';
      end if;

      ---------------------------------------------------------------- company
      v_company_id := null;

      -- Domain first: it is the reliable key. "Müller GmbH" and "Mueller GmbH"
      -- are two names for one company, but muellergmbh.de is unambiguous.
      if v_company_domain is not null then
        select c.id into v_company_id
          from public.companies c
         where c.organization_id = v_job.organization_id
           and c.domain = v_company_domain
         limit 1;
      end if;

      if v_company_id is null and v_company_name is not null then
        select c.id into v_company_id
          from public.companies c
         where c.organization_id = v_job.organization_id
           and lower(c.name) = lower(v_company_name)
         limit 1;
      end if;

      if v_company_id is null
         and v_job.create_companies
         and (v_company_name is not null or v_company_domain is not null)
      then
        insert into public.companies (organization_id, name, domain, import_job_id)
        values (
          v_job.organization_id,
          left(coalesce(v_company_name, v_company_domain::text), 200),
          v_company_domain,
          p_job_id
        )
        returning id into v_company_id;
      end if;

      ---------------------------------------------------- duplicate detection
      -- Tier 1: exact email within the organization, case-insensitive. This
      -- also catches duplicates *within the same file* — an earlier row in this
      -- chunk is already visible to this query inside the transaction.
      v_existing_id := null;
      if v_email is not null then
        select c.id into v_existing_id
          from public.contacts c
         where c.organization_id = v_job.organization_id
           and c.email = v_email
         limit 1;
      end if;

      if v_existing_id is not null then
        if v_job.duplicate_policy = 'update' then
          -- coalesce, not overwrite: a blank cell in the spreadsheet must not
          -- erase a phone number somebody added by hand.
          update public.contacts
             set first_name   = coalesce(v_first, first_name),
                 last_name    = coalesce(v_last, last_name),
                 phone        = coalesce(v_phone, phone),
                 job_title    = coalesce(v_title, job_title),
                 linkedin_url = coalesce(v_linkedin, linkedin_url),
                 notes        = coalesce(v_notes, notes),
                 company_id   = coalesce(v_company_id, company_id)
           where id = v_existing_id;
          v_updated := v_updated + 1;
        else
          -- 'skip' and 'create' both land here. 'create' cannot insert a second
          -- row with the same email — the unique index forbids it — so the
          -- honest outcome is to skip and say so.
          v_skipped := v_skipped + 1;
        end if;
      else
        insert into public.contacts (
          organization_id, company_id, first_name, last_name, email, phone,
          job_title, linkedin_url, notes, source, import_job_id
        )
        values (
          v_job.organization_id, v_company_id, v_first, v_last, v_email, v_phone,
          v_title, v_linkedin, v_notes, 'csv', p_job_id
        );
        v_created := v_created + 1;
      end if;

    exception when others then
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;

      -- Translate known failures into keys the UI can render in the reader's
      -- language; anything else falls back to the raw message.
      v_code := case v_state
        when 'P0008' then 'missingIdentity'
        when 'P0009' then v_msg
        when '23505' then 'duplicateEmail'
        when '23514' then 'invalidValue'
        when 'P0005' then 'ownerNotMember'
        when '22001' then 'valueTooLong'
        else 'unknown'
      end;

      v_error_count := v_error_count + 1;
      if jsonb_array_length(v_errors) < 200 then
        v_errors := v_errors || jsonb_build_object(
          'row', v_row_number,
          'code', v_code,
          'message', left(v_msg, 200)
        );
      end if;
    end;
  end loop;

  update public.import_jobs
     set processed_rows = processed_rows + jsonb_array_length(p_rows),
         created_count  = created_count + v_created,
         updated_count  = updated_count + v_updated,
         skipped_count  = skipped_count + v_skipped,
         error_count    = error_count + v_error_count,
         errors = case
           when jsonb_array_length(errors) >= 500 then errors
           else errors || v_errors
         end
   where id = p_job_id;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_error_count,
    'error_details', v_errors
  );
end;
$$;

revoke all on function public.import_contacts_chunk(uuid, jsonb) from public, anon;
grant execute on function public.import_contacts_chunk(uuid, jsonb) to authenticated;
