/*
 * Creation activities move from per-row to per-statement triggers.
 *
 * Measured on 2,000 contacts, the same work as one INSERT ... SELECT:
 *   row-level        0.256 ms/row
 *   statement-level  0.138 ms/row
 *
 * The CSV importer inserts one row per statement, so it sees no difference
 * (0.416 vs 0.420 ms/row - within noise). Statement-level is therefore never
 * worse and twice as fast on any bulk path, including whatever writes deals or
 * companies in bulk later.
 *
 * The honest cost of logging creation at all, measured against a baseline with
 * no activity trigger: 0.258 -> 0.416 ms/row on the row-at-a-time import path.
 * Against Phase 3's measured 0.47 ms/row for the full import (dedupe and
 * normalisation included) that takes a 5,000-row import from ~2.4 s to ~3.2 s,
 * against a 60 s budget. The earlier "roughly 0.05 ms per row" in
 * phase5_activity_triggers was a guess, and it was wrong by 3x.
 */

drop trigger contacts_record_created on public.contacts;
drop trigger companies_record_created on public.companies;
drop function public.record_contact_created();
drop function public.record_company_created();

create or replace function public.record_contacts_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (organization_id, type, contact_id, actor_id, metadata)
  select n.organization_id,
         -- An imported contact reads as an import, not as something a human
         -- typed. A 5,000-row CSV should not fabricate 5,000 authored events.
         case when n.import_job_id is not null then 'import'::public.activity_type
              else 'contact_created'::public.activity_type end,
         n.id,
         (select auth.uid()),
         jsonb_strip_nulls(jsonb_build_object('import_job_id', n.import_job_id))
    from new_rows n;
  return null;
end;
$$;

create or replace function public.record_companies_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (organization_id, type, company_id, actor_id, metadata)
  select n.organization_id,
         case when n.import_job_id is not null then 'import'::public.activity_type
              else 'company_created'::public.activity_type end,
         n.id,
         (select auth.uid()),
         jsonb_strip_nulls(jsonb_build_object('import_job_id', n.import_job_id))
    from new_rows n;
  return null;
end;
$$;

create trigger contacts_record_created
  after insert on public.contacts
  referencing new table as new_rows
  for each statement execute function public.record_contacts_created();

create trigger companies_record_created
  after insert on public.companies
  referencing new table as new_rows
  for each statement execute function public.record_companies_created();

revoke all on function public.record_contacts_created() from public, anon, authenticated;
revoke all on function public.record_companies_created() from public, anon, authenticated;
