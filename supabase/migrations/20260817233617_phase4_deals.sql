-- Deals.
--
-- The deal is the pipeline card, not the contact — the single most important
-- schema decision in the plan (§0.2). A contact can have several deals over
-- time, and reversing this later is expensive.
--
-- Every cross-entity link is a composite foreign key through organization_id,
-- so a deal cannot reference another tenant's stage, contact or company, and
-- cannot reference a stage belonging to a different pipeline. Those are
-- structural impossibilities here, not policy checks that might be forgotten.

create type public.deal_status as enum ('open', 'won', 'lost');

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  pipeline_id uuid not null,
  stage_id uuid not null,

  contact_id uuid,
  company_id uuid,

  title text not null check (length(btrim(title)) between 1 and 200),

  -- Integer cents, never a float. Formatted only at render time, in the
  -- viewer's locale with the organization's currency (convention 1).
  value_cents bigint not null default 0 check (value_cents >= 0),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),

  status public.deal_status not null default 'open',
  expected_close_date date,

  owner_id uuid references public.profiles(id) on delete set null,

  -- Fractional index for ordering within a stage. Dropping between 1.0 and 2.0
  -- writes 1.5 — one row, instead of renumbering the whole column on every
  -- drag. numeric, not float: arbitrary precision means repeated halving cannot
  -- silently collapse two cards onto the same value.
  position numeric not null default 0,

  -- Powers "days in stage" and, later, the funnel report.
  stage_entered_at timestamptz not null default now(),
  closed_at timestamptz,
  lost_reason text check (lost_reason is null or length(lost_reason) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deals_pipeline_same_org
    foreign key (organization_id, pipeline_id)
    references public.pipelines (organization_id, id) on delete cascade,

  -- The stage must belong to this deal's pipeline AND organization.
  constraint deals_stage_same_pipeline
    foreign key (organization_id, pipeline_id, stage_id)
    references public.pipeline_stages (organization_id, pipeline_id, id),

  constraint deals_contact_same_org
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete set null (contact_id),

  constraint deals_company_same_org
    foreign key (organization_id, company_id)
    references public.companies (organization_id, id) on delete set null (company_id),

  -- A closed deal has a closing date; an open one does not.
  constraint deals_closed_at_matches_status check (
    (status = 'open' and closed_at is null)
    or (status <> 'open' and closed_at is not null)
  )
);

-- The board query: every open card of a pipeline, grouped by stage, in order.
create index deals_board_idx
  on public.deals (organization_id, pipeline_id, stage_id, position, id)
  where status = 'open';

create index deals_org_created_idx on public.deals (organization_id, created_at desc);
create index deals_org_owner_idx on public.deals (organization_id, owner_id);
create index deals_org_contact_idx on public.deals (organization_id, contact_id)
  where contact_id is not null;
create index deals_org_company_idx on public.deals (organization_id, company_id)
  where company_id is not null;
create index deals_org_close_date_idx on public.deals (organization_id, expected_close_date)
  where status = 'open';

-- Covering index for the ON DELETE SET NULL scan when a profile is removed.
create index deals_owner_idx on public.deals (owner_id) where owner_id is not null;

create index deals_title_trgm_idx on public.deals
  using gin (title extensions.gin_trgm_ops);

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

create trigger deals_validate_owner
  before insert or update of owner_id, organization_id on public.deals
  for each row execute function public.validate_owner_is_member();

alter table public.deals enable row level security;

create policy "members can read deals"
  on public.deals for select to authenticated
  using (organization_id in (select public.my_organization_ids()));
create policy "members can create deals"
  on public.deals for insert to authenticated
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can update deals"
  on public.deals for update to authenticated
  using (organization_id in (select public.my_organization_ids()))
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can delete deals"
  on public.deals for delete to authenticated
  using (organization_id in (select public.my_organization_ids()));

comment on column public.deals.value_cents is
  'Integer cents. Never a float — 0.1 + 0.2 pricing bugs in a sales tool destroy trust.';
comment on column public.deals.position is
  'Fractional index within the stage. Drop between neighbours a and b writes (a+b)/2.';
