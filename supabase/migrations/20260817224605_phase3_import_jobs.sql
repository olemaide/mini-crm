-- CSV import jobs.
--
-- Import is the single biggest activation lever in the product: a user who
-- cannot get their spreadsheet in never reaches the pipeline board. It is also
-- the only feature that can silently corrupt a customer's whole database, so
-- every run is recorded as a job with provenance on each row it creates.
--
-- That provenance is what makes "undo import" possible, which in turn is what
-- makes users willing to try the import at all.

create type public.import_status as enum (
  'pending',     -- created, file not yet processed
  'running',     -- chunks are being uploaded
  'completed',
  'failed',
  'cancelled',
  'rolled_back'  -- undone by the user
);

create type public.import_duplicate_policy as enum (
  'skip',    -- leave the existing contact untouched
  'update',  -- overwrite non-empty incoming fields
  'create'   -- insert anyway; only possible where no unique index blocks it
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,

  filename text not null check (length(btrim(filename)) between 1 and 255),
  status public.import_status not null default 'pending',
  duplicate_policy public.import_duplicate_policy not null default 'skip',
  -- Whether unknown company names/domains in the file become new companies.
  create_companies boolean not null default true,

  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),

  -- { "email": "E-Mail", "first_name": "Vorname", ... } — the chosen mapping,
  -- kept so it can be reused as a template for the next file.
  mapping jsonb,
  -- [{ row: 12, field: "email", message: "invalid" }] — capped in the RPC so a
  -- pathological file cannot grow this row without bound.
  errors jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index import_jobs_org_created_idx
  on public.import_jobs (organization_id, created_at desc);

-- Supports the concurrency check in create_import_job().
create index import_jobs_org_active_idx
  on public.import_jobs (organization_id)
  where status in ('pending', 'running');

create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();

alter table public.import_jobs enable row level security;

create policy "members can read import jobs"
  on public.import_jobs for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

create policy "members can update import jobs"
  on public.import_jobs for update to authenticated
  using (organization_id in (select public.my_organization_ids()))
  with check (organization_id in (select public.my_organization_ids()));

create policy "members can delete import jobs"
  on public.import_jobs for delete to authenticated
  using (organization_id in (select public.my_organization_ids()));

-- No INSERT policy: jobs are created only through create_import_job(), which
-- enforces the per-organization concurrency limit. Same pattern as
-- organizations and invitations.

comment on table public.import_jobs is
  'One CSV import run. Rows it created carry import_job_id so the run can be undone.';
