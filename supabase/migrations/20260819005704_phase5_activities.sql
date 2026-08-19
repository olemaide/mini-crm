-- The activity feed: one table for everything that ever happened to a record.
--
-- Two kinds of row live here and they have opposite rules:
--
--   * User-authored (note, logged email/call/meeting) — `body` is prose the
--     user typed. Stored verbatim, never translated, editable by its author.
--   * System-generated (stage changed, deal won, contact created) — `body` is
--     ALWAYS null. The row stores `type` plus `metadata`, and the sentence is
--     composed at render time from a translation key, so the same event reads
--     "Anna moved this deal to Qualified" in English and "... verschoben" in
--     German. Writing a rendered sentence into `body` would freeze the language
--     at creation time (build plan §1.5 rule 3, README convention 5).
--
-- The RLS policies below are what actually enforce that split: a client may
-- only insert the four user-authored types, and only as itself.

create type public.activity_type as enum (
  'note',
  'email_logged',
  'call_logged',
  'meeting_logged',
  'stage_changed',
  'deal_created',
  'deal_won',
  'deal_lost',
  'contact_created',
  'company_created',
  'task_created',
  'task_completed',
  'field_changed',
  'import'
);

-- Needed for the composite foreign key below. contacts, companies, pipelines
-- and pipeline_stages already carry the equivalent.
alter table public.deals add constraint deals_organization_id_id_key unique (organization_id, id);

create table public.activities (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.activity_type not null,

  -- Polymorphic subject. Exactly one, never two — see the constraint below.
  contact_id uuid,
  company_id uuid,
  deal_id uuid,

  -- Null means the system did it. Survives the actor leaving the organization.
  actor_id uuid references public.profiles(id) on delete set null,

  -- User prose only. Null for every system-generated row.
  body text check (body is null or length(body) <= 10000),

  -- System rows: {from_stage_id, from_stage_name, to_stage_id, to_stage_name},
  -- {field, old, new}, {import_job_id}.
  -- User rows: {subject, direction, duration_minutes}.
  metadata jsonb not null default '{}'::jsonb,

  -- When it happened, which a user may backdate. Distinct from created_at,
  -- which is when the row was written. The feed sorts on occurred_at.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set only when an edit lands after the silent grace period; see the trigger.
  edited_at timestamptz,

  /*
   * Exactly one subject, not "at least one".
   *
   * This is what makes the roll-up feed correct. A deal's feed is the union of
   * its own rows and its contact's rows; if a row could carry both a deal_id
   * and a contact_id it would appear twice in that union, and de-duplicating a
   * keyset-paginated merge is genuinely awkward. Attaching each event to the
   * single thing it happened to pushes roll-up entirely into the read path,
   * where it belongs.
   */
  constraint activities_exactly_one_subject
    check (num_nonnulls(contact_id, company_id, deal_id) = 1),

  -- Cross-tenant references are structurally impossible, not merely forbidden
  -- by policy: the subject must belong to the same organization as the row.
  constraint activities_contact_same_org
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint activities_company_same_org
    foreign key (organization_id, company_id)
    references public.companies (organization_id, id) on delete cascade,
  constraint activities_deal_same_org
    foreign key (organization_id, deal_id)
    references public.deals (organization_id, id) on delete cascade,

  constraint activities_metadata_is_object check (jsonb_typeof(metadata) = 'object'),

  -- A note with no text is a mis-click, not an entry.
  constraint activities_note_needs_body
    check (type <> 'note' or (body is not null and length(btrim(body)) > 0))
);

-- One index per subject, each ending in the full keyset sort key so a page of
-- 25 is an index range scan with no sort node. `id desc` is not decoration:
-- two activities can share an occurred_at to the microsecond after a backdate,
-- and without a tiebreaker in the index the cursor can skip or repeat a row.
create index activities_contact_idx
  on public.activities (organization_id, contact_id, occurred_at desc, id desc)
  where contact_id is not null;
create index activities_company_idx
  on public.activities (organization_id, company_id, occurred_at desc, id desc)
  where company_id is not null;
create index activities_deal_idx
  on public.activities (organization_id, deal_id, occurred_at desc, id desc)
  where deal_id is not null;

-- Org-wide feed (dashboard "recent activity").
create index activities_org_idx on public.activities (organization_id, occurred_at desc, id desc);

-- Covers the ON DELETE SET NULL scan when a profile is removed.
create index activities_actor_idx on public.activities (actor_id) where actor_id is not null;

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

/*
 * Freezes everything that identifies the row.
 *
 * RLS can gate *who* may update, but a policy cannot compare OLD to NEW, so
 * without this a user could edit their own note and quietly re-point it at a
 * different contact, or relabel it as a system event. The update policy exists
 * so people can fix a typo — that is all it should be able to do.
 */
create or replace function public.guard_activity_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.type is distinct from old.type
     or new.contact_id is distinct from old.contact_id
     or new.company_id is distinct from old.company_id
     or new.deal_id is distinct from old.deal_id
     or new.actor_id is distinct from old.actor_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Activity identity is immutable' using errcode = '42501';
  end if;

  -- A backdated entry is the point; a future-dated one would pin itself to the
  -- top of the feed forever.
  if new.occurred_at > now() + interval '1 minute' then
    raise exception 'occurred_at cannot be in the future' using errcode = '22023';
  end if;

  /*
   * "(edited)" is a trust signal, so it has to mean something. Fixing a typo
   * ten seconds after posting is not an edit anyone needs to be warned about;
   * rewriting yesterday's call note is. The 24 h grace period keeps the marker
   * rare enough that readers still notice it.
   */
  if (new.body is distinct from old.body or new.occurred_at is distinct from old.occurred_at)
     and now() - old.created_at > interval '24 hours' then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.guard_activity_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.occurred_at > now() + interval '1 minute' then
    raise exception 'occurred_at cannot be in the future' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger activities_guard_insert
  before insert on public.activities
  for each row execute function public.guard_activity_insert();

create trigger activities_guard_edit
  before update on public.activities
  for each row execute function public.guard_activity_edit();

alter table public.activities enable row level security;

-- Set form, never the scalar helper: measured 30x on a 10,000-row table.
create policy "members can read activities"
  on public.activities for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

/*
 * A client may only ever write the four types a human authors, as itself.
 *
 * This is the enforcement point for the "system rows carry no prose" rule.
 * Without the type restriction, anyone could POST a forged `stage_changed` or
 * `deal_won` row and the audit trail would be worthless. System rows are
 * written by triggers, which run as the table owner and bypass RLS entirely.
 */
create policy "members can log their own entries"
  on public.activities for insert to authenticated
  with check (
    organization_id in (select public.my_organization_ids())
    and type in ('note', 'email_logged', 'call_logged', 'meeting_logged')
    and actor_id = (select auth.uid())
    and body is not null
  );

create policy "authors can edit their own entries"
  on public.activities for update to authenticated
  using (
    organization_id in (select public.my_organization_ids())
    and actor_id = (select auth.uid())
    and type in ('note', 'email_logged', 'call_logged', 'meeting_logged')
  )
  with check (
    organization_id in (select public.my_organization_ids())
    and actor_id = (select auth.uid())
    and type in ('note', 'email_logged', 'call_logged', 'meeting_logged')
  );

-- Authors delete their own; admins can remove anyone's, because someone will
-- eventually paste a password into a note. System rows have no delete path.
create policy "authors and admins can delete entries"
  on public.activities for delete to authenticated
  using (
    type in ('note', 'email_logged', 'call_logged', 'meeting_logged')
    and (
      (
        actor_id = (select auth.uid())
        and organization_id in (select public.my_organization_ids())
      )
      or organization_id in (select public.my_admin_organization_ids())
    )
  );

revoke all on function public.guard_activity_edit() from public, anon, authenticated;
revoke all on function public.guard_activity_insert() from public, anon, authenticated;

comment on table public.activities is
  'Chronological feed. System rows store type + metadata and are composed into a sentence at render time; only user-authored rows carry prose in body.';
comment on column public.activities.occurred_at is
  'When it happened (may be backdated). Feed sort key, paired with id as tiebreaker.';
comment on column public.activities.body is
  'User prose, stored verbatim in whatever language it was typed. Always null for system rows.';
