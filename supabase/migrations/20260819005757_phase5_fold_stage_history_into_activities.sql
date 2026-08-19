/*
 * Folds deal_stage_history into activities and drops it.
 *
 * Phase 4 built a purpose-built table for one event type, one day before
 * Phase 5 generalised it. Keeping both would mean every stage move writes two
 * rows describing the same fact, and two places for the funnel report to
 * disagree about what happened.
 *
 * Folding it in also fixes a real flaw in that table: its to_stage_id was
 * `on delete cascade`, so deleting a stage ERASED every history row that had
 * ever moved a deal into it. An audit trail that a UI action can silently
 * delete is not an audit trail. Activities snapshot the stage name instead, so
 * the record survives both renames and deletions.
 */

insert into public.activities (
  organization_id, type, deal_id, actor_id, metadata, occurred_at, created_at, updated_at
)
select
  h.organization_id,
  case
    when h.from_stage_id is null then 'deal_created'::public.activity_type
    when ts.is_won then 'deal_won'::public.activity_type
    when ts.is_lost then 'deal_lost'::public.activity_type
    else 'stage_changed'::public.activity_type
  end,
  h.deal_id,
  h.changed_by,
  jsonb_strip_nulls(jsonb_build_object(
    'from_stage_id', h.from_stage_id,
    'from_stage_name', fs.name,
    'to_stage_id', h.to_stage_id,
    'to_stage_name', ts.name,
    'deal_title', d.title,
    'value_cents', d.value_cents,
    'currency', d.currency,
    'backfilled', true
  )),
  h.changed_at,
  h.changed_at,
  h.changed_at
from public.deal_stage_history h
join public.deals d on d.id = h.deal_id
left join public.pipeline_stages ts on ts.id = h.to_stage_id
left join public.pipeline_stages fs on fs.id = h.from_stage_id;

drop table public.deal_stage_history;

-- Records that predate the feed would otherwise open with nothing in them.
-- The actor is unknown for these, so they read as system events, which is
-- honest: nobody recorded who did it at the time.
insert into public.activities (
  organization_id, type, contact_id, metadata, occurred_at, created_at, updated_at
)
select
  c.organization_id,
  case when c.import_job_id is not null then 'import'::public.activity_type
       else 'contact_created'::public.activity_type end,
  c.id,
  jsonb_strip_nulls(jsonb_build_object('import_job_id', c.import_job_id, 'backfilled', true)),
  c.created_at, c.created_at, c.created_at
from public.contacts c
where not exists (
  select 1 from public.activities a
   where a.contact_id = c.id and a.type in ('contact_created', 'import')
);

insert into public.activities (
  organization_id, type, company_id, metadata, occurred_at, created_at, updated_at
)
select
  co.organization_id,
  case when co.import_job_id is not null then 'import'::public.activity_type
       else 'company_created'::public.activity_type end,
  co.id,
  jsonb_strip_nulls(jsonb_build_object('import_job_id', co.import_job_id, 'backfilled', true)),
  co.created_at, co.created_at, co.created_at
from public.companies co
where not exists (
  select 1 from public.activities a
   where a.company_id = co.id and a.type in ('company_created', 'import')
);
