-- Import job lifecycle: create, finalize, undo.
--
-- create_import_job is security definer only because there is no INSERT policy
-- on import_jobs — the concurrency limit has to live somewhere that a client
-- cannot route around. It re-derives the org from membership and never trusts a
-- caller-supplied organization_id.

create or replace function public.create_import_job(
  p_organization_id uuid,
  p_filename text,
  p_total_rows integer,
  p_duplicate_policy public.import_duplicate_policy default 'skip',
  p_create_companies boolean default true,
  p_mapping jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_active integer;
  v_job uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if coalesce(btrim(p_filename), '') = '' then
    raise exception 'A filename is required' using errcode = '22023';
  end if;

  -- Upper bound from the build plan. A larger file is not refused because it
  -- would break, but because a 100k-row import wants a different design
  -- (server-side batch) than a browser feeding chunks over a flaky connection.
  if p_total_rows < 1 or p_total_rows > 20000 then
    raise exception 'A file must contain between 1 and 20000 rows'
      using errcode = '22023';
  end if;

  -- Concurrency limit. Three simultaneous imports per organization is already
  -- generous; the cap exists so one user cannot saturate the database for
  -- their colleagues.
  select count(*) into v_active
    from public.import_jobs j
   where j.organization_id = p_organization_id
     and j.status in ('pending', 'running');

  if v_active >= 3 then
    raise exception 'Too many imports are already running' using errcode = 'P0006';
  end if;

  insert into public.import_jobs (
    organization_id, created_by, filename, total_rows,
    duplicate_policy, create_companies, mapping, status
  )
  values (
    p_organization_id, v_actor, btrim(p_filename), p_total_rows,
    p_duplicate_policy, p_create_companies, p_mapping, 'running'
  )
  returning id into v_job;

  return v_job;
end;
$$;

create or replace function public.finalize_import_job(
  p_job_id uuid,
  p_status public.import_status
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('completed', 'failed', 'cancelled') then
    raise exception 'Invalid terminal status' using errcode = '22023';
  end if;

  -- RLS scopes this to the caller's organizations.
  update public.import_jobs
     set status = p_status,
         completed_at = now()
   where id = p_job_id
     and status in ('pending', 'running');
end;
$$;

/*
 * Undo: delete exactly the rows this job created.
 *
 * Updates are NOT reverted — the previous field values were never captured, and
 * inventing them would be worse than leaving them. The UI says so plainly
 * rather than implying a full rollback.
 *
 * Contacts are deleted before companies so a contact created by this run does
 * not block its company via the composite foreign key. Contacts that existed
 * beforehand simply have company_id set to null by ON DELETE SET NULL, which is
 * the correct outcome: the person stays, the invented company goes.
 */
create or replace function public.undo_import_job(p_job_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contacts integer;
  v_companies integer;
  v_org uuid;
begin
  select organization_id into v_org
    from public.import_jobs
   where id = p_job_id
     and status = 'completed';

  if v_org is null then
    raise exception 'Import not found or not undoable' using errcode = 'P0002';
  end if;

  with removed as (
    delete from public.contacts
     where import_job_id = p_job_id
       and organization_id = v_org
    returning 1
  )
  select count(*) into v_contacts from removed;

  with removed as (
    delete from public.companies
     where import_job_id = p_job_id
       and organization_id = v_org
    returning 1
  )
  select count(*) into v_companies from removed;

  update public.import_jobs
     set status = 'rolled_back',
         completed_at = now()
   where id = p_job_id;

  return jsonb_build_object(
    'contacts_deleted', v_contacts,
    'companies_deleted', v_companies
  );
end;
$$;

revoke all on function public.create_import_job(uuid, text, integer, public.import_duplicate_policy, boolean, jsonb) from public, anon;
revoke all on function public.finalize_import_job(uuid, public.import_status) from public, anon;
revoke all on function public.undo_import_job(uuid) from public, anon;

grant execute on function public.create_import_job(uuid, text, integer, public.import_duplicate_policy, boolean, jsonb) to authenticated;
grant execute on function public.finalize_import_job(uuid, public.import_status) to authenticated;
grant execute on function public.undo_import_job(uuid) to authenticated;
