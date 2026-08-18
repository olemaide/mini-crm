-- Pipelines and their stages.
--
-- One deviation from the build plan: stage `position` is `numeric`, not `int`
-- with a deferrable unique constraint. Fractional indexing means reordering a
-- stage writes one row instead of renumbering the whole pipeline, and it is the
-- same technique deals already need for card ordering — one idea instead of two.
-- Ties break on id, so the ordering is still total.

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Anchor for the composite foreign keys on stages and deals.
  unique (organization_id, id)
);

-- At most one default pipeline per organization.
create unique index pipelines_one_default_per_org
  on public.pipelines (organization_id)
  where is_default;

create index pipelines_org_idx on public.pipelines (organization_id, created_at);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null,

  -- Stored text in the organization's language, seeded once and then owned by
  -- the user (build plan §1.5 rule 3). A member switching their own UI language
  -- must never rewrite a stage somebody renamed.
  name text not null check (length(btrim(name)) between 1 and 60),
  position numeric not null,

  -- Drives the weighted pipeline value, which is the number that actually
  -- predicts revenue.
  probability numeric(5, 2) not null default 0
    check (probability >= 0 and probability <= 100),

  is_won boolean not null default false,
  is_lost boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A stage cannot be both the win and the loss.
  constraint pipeline_stages_won_xor_lost check (not (is_won and is_lost)),

  constraint pipeline_stages_pipeline_same_org
    foreign key (organization_id, pipeline_id)
    references public.pipelines (organization_id, id) on delete cascade,

  -- Anchor for the composite foreign key on deals: a deal's stage must belong
  -- to the deal's pipeline *and* organization.
  unique (organization_id, pipeline_id, id)
);

-- Exactly one terminal stage of each kind per pipeline. Two "Won" columns would
-- make the win rate meaningless and the close automation ambiguous.
create unique index pipeline_stages_one_won
  on public.pipeline_stages (pipeline_id) where is_won;
create unique index pipeline_stages_one_lost
  on public.pipeline_stages (pipeline_id) where is_lost;

create index pipeline_stages_order_idx
  on public.pipeline_stages (organization_id, pipeline_id, position, id);

create trigger pipelines_set_updated_at
  before update on public.pipelines
  for each row execute function public.set_updated_at();

create trigger pipeline_stages_set_updated_at
  before update on public.pipeline_stages
  for each row execute function public.set_updated_at();

alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;

create policy "members can read pipelines"
  on public.pipelines for select to authenticated
  using (organization_id in (select public.my_organization_ids()));
create policy "members can create pipelines"
  on public.pipelines for insert to authenticated
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can update pipelines"
  on public.pipelines for update to authenticated
  using (organization_id in (select public.my_organization_ids()))
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can delete pipelines"
  on public.pipelines for delete to authenticated
  using (organization_id in (select public.my_organization_ids()));

create policy "members can read stages"
  on public.pipeline_stages for select to authenticated
  using (organization_id in (select public.my_organization_ids()));
create policy "members can create stages"
  on public.pipeline_stages for insert to authenticated
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can update stages"
  on public.pipeline_stages for update to authenticated
  using (organization_id in (select public.my_organization_ids()))
  with check (organization_id in (select public.my_organization_ids()));
create policy "members can delete stages"
  on public.pipeline_stages for delete to authenticated
  using (organization_id in (select public.my_organization_ids()));

comment on column public.pipeline_stages.name is
  'Stored in the organization''s language. Seeded once; never re-translated on a locale switch.';
comment on column public.pipeline_stages.probability is
  'Percent, 0-100. Weighted value = sum(value_cents * probability / 100).';
