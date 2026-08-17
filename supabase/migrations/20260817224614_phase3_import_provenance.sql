-- Provenance: which import created this row.
--
-- ON DELETE SET NULL, never CASCADE. Deleting the job record must not delete
-- the customer's contacts — undo is an explicit, separate action with its own
-- confirmation, not a side effect of tidying up job history.

alter table public.contacts
  add column import_job_id uuid references public.import_jobs(id) on delete set null;

alter table public.companies
  add column import_job_id uuid references public.import_jobs(id) on delete set null;

-- Partial: only imported rows carry a job id, and only those are ever queried
-- this way (by the undo path).
create index contacts_import_job_idx on public.contacts (import_job_id)
  where import_job_id is not null;

create index companies_import_job_idx on public.companies (import_job_id)
  where import_job_id is not null;

comment on column public.contacts.import_job_id is
  'Set when the row was created by an import. Cleared, not cascaded, if the job record is deleted.';
