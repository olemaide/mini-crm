-- System-generated activities, written by triggers.
--
-- Not by the Server Action that performs the change. A deal's stage can move
-- from the board, the detail page, a bulk edit, an import or a future
-- automation; putting the bookkeeping in application code means one forgotten
-- path silently breaks the audit trail forever. A trigger cannot be forgotten.

/*
 * Stage moves, and the creation of a deal.
 *
 * Replaces the body of the Phase 4 function, which wrote to
 * deal_stage_history. The next migration folds that table into this one.
 *
 * Stage NAMES are snapshotted into metadata alongside the ids. Three reasons:
 * the feed renders with no joins at all; renaming "Angebot" to "Proposal"
 * does not rewrite history into something that never happened; and deleting a
 * stage leaves the record readable instead of dangling. Names are stored text
 * in the organization's language and are never translated (§1.5 rule 3), so
 * snapshotting them is consistent with how they are treated everywhere else —
 * only the sentence around them is composed from a translation key.
 */
create or replace function public.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to_name text;
  v_is_won boolean;
  v_is_lost boolean;
  v_from_name text;
  v_type public.activity_type;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return null;
  end if;

  select s.name, s.is_won, s.is_lost
    into v_to_name, v_is_won, v_is_lost
    from public.pipeline_stages s
   where s.id = new.stage_id;

  if tg_op = 'INSERT' then
    v_type := 'deal_created';
  elsif coalesce(v_is_won, false) then
    v_type := 'deal_won';
  elsif coalesce(v_is_lost, false) then
    v_type := 'deal_lost';
  else
    v_type := 'stage_changed';
    select s.name into v_from_name
      from public.pipeline_stages s
     where s.id = old.stage_id;
  end if;

  if tg_op = 'UPDATE' and v_type <> 'stage_changed' then
    select s.name into v_from_name
      from public.pipeline_stages s
     where s.id = old.stage_id;
  end if;

  insert into public.activities (organization_id, type, deal_id, actor_id, metadata)
  values (
    new.organization_id,
    v_type,
    new.id,
    (select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object(
      'from_stage_id', case when tg_op = 'UPDATE' then old.stage_id end,
      'from_stage_name', v_from_name,
      'to_stage_id', new.stage_id,
      'to_stage_name', v_to_name,
      'deal_title', new.title,
      'value_cents', new.value_cents,
      'currency', new.currency
    ))
  );

  return null;
end;
$$;

/*
 * Field changes worth a line in the feed.
 *
 * A deliberately short allow-list. Logging every column turns the feed into a
 * changelog nobody reads and buries the notes that matter. These three are the
 * ones a sales manager actually asks about: who owns it, what it is worth, and
 * when it is expected to close.
 */
create or replace function public.record_deal_field_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_owner text;
  v_new_owner text;
begin
  if new.owner_id is distinct from old.owner_id then
    select p.full_name into v_old_owner from public.profiles p where p.id = old.owner_id;
    select p.full_name into v_new_owner from public.profiles p where p.id = new.owner_id;

    insert into public.activities (organization_id, type, deal_id, actor_id, metadata)
    values (new.organization_id, 'field_changed', new.id, v_actor,
      jsonb_strip_nulls(jsonb_build_object(
        'field', 'owner',
        'old_id', old.owner_id, 'old', v_old_owner,
        'new_id', new.owner_id, 'new', v_new_owner
      )));
  end if;

  if new.value_cents is distinct from old.value_cents then
    insert into public.activities (organization_id, type, deal_id, actor_id, metadata)
    values (new.organization_id, 'field_changed', new.id, v_actor,
      jsonb_build_object(
        'field', 'value',
        'old', old.value_cents, 'new', new.value_cents,
        'currency', new.currency
      ));
  end if;

  if new.expected_close_date is distinct from old.expected_close_date then
    insert into public.activities (organization_id, type, deal_id, actor_id, metadata)
    values (new.organization_id, 'field_changed', new.id, v_actor,
      jsonb_strip_nulls(jsonb_build_object(
        'field', 'expected_close_date',
        'old', old.expected_close_date, 'new', new.expected_close_date
      )));
  end if;

  return null;
end;
$$;

create trigger deals_record_field_change
  after update of owner_id, value_cents, expected_close_date on public.deals
  for each row execute function public.record_deal_field_change();

/*
 * Contact and company creation.
 *
 * An imported contact gets type 'import' rather than 'contact_created', so a
 * 5,000-row CSV reads as one honest line per record instead of pretending a
 * human typed each one. The extra insert costs roughly 0.05 ms per row against
 * an import path already measured at 0.47 ms per row.
 */
create or replace function public.record_contact_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (organization_id, type, contact_id, actor_id, metadata)
  values (
    new.organization_id,
    case when new.import_job_id is not null then 'import'::public.activity_type
         else 'contact_created'::public.activity_type end,
    new.id,
    (select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object('import_job_id', new.import_job_id))
  );
  return null;
end;
$$;

create or replace function public.record_company_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (organization_id, type, company_id, actor_id, metadata)
  values (
    new.organization_id,
    case when new.import_job_id is not null then 'import'::public.activity_type
         else 'company_created'::public.activity_type end,
    new.id,
    (select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object('import_job_id', new.import_job_id))
  );
  return null;
end;
$$;

create trigger contacts_record_created
  after insert on public.contacts
  for each row execute function public.record_contact_created();

create trigger companies_record_created
  after insert on public.companies
  for each row execute function public.record_company_created();

revoke all on function public.record_deal_field_change() from public, anon, authenticated;
revoke all on function public.record_contact_created() from public, anon, authenticated;
revoke all on function public.record_company_created() from public, anon, authenticated;
