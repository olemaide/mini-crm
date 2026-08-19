-- Billing.
--
-- Two tables with very different jobs: `subscriptions` is the current state one
-- row per tenant, `billing_events` is an append-only log whose primary key is
-- Polar's event id — which is what makes webhook replay a no-op.

create type public.billing_plan as enum ('trial', 'starter', 'pro', 'canceled', 'past_due');

create table public.subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  polar_customer_id text,
  polar_subscription_id text unique,
  product_id text,

  plan public.billing_plan not null default 'trial',
  -- Polar's own status, mirrored verbatim for support questions. Never parsed
  -- into behaviour — `plan` is what the app reads.
  status text not null default 'trialing',

  seats integer not null default 1 check (seats >= 0),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_polar_customer_idx on public.subscriptions (polar_customer_id)
  where polar_customer_id is not null;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

/*
 * Readable by members, writable by nobody.
 *
 * There is deliberately no insert, update or delete policy. Every write comes
 * from the webhook handler using the service-role client, which bypasses RLS.
 * A member who could edit this row could grant themselves the Pro plan.
 */
create policy "members can read their subscription"
  on public.subscriptions for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

/*
 * Webhook idempotency and audit.
 *
 * The primary key is Polar's event id, so a replayed delivery hits a unique
 * violation on insert and the handler stops before touching anything. Polar
 * retries on any non-2xx, and a handler that is not idempotent double-grants
 * entitlements or double-counts an order.
 *
 * No organization_id requirement: an event can arrive before we know which
 * tenant it belongs to, and some belong to none. It is on the RLS audit's
 * exempt list for that reason, and no policy grants access — service role only.
 */
create table public.billing_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  organization_id uuid references public.organizations(id) on delete set null,
  processed_at timestamptz not null default now()
);

create index billing_events_type_idx on public.billing_events (type, processed_at desc);

alter table public.billing_events enable row level security;

-- RLS on with zero policies: unreachable by anon and authenticated alike. The
-- audit script allows this only for tables on its exempt list.
comment on table public.billing_events is
  'Append-only webhook log, keyed by Polar event id for idempotency. Service-role only; RLS enabled with no policies on purpose.';

/*
 * Every organization starts a 14-day trial with full Pro features and no card.
 *
 * Seeded by trigger so the row exists from the first moment — an organization
 * with no subscription row would have no entitlements and would look expired
 * rather than new.
 */
create or replace function public.seed_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (organization_id, plan, status, seats, trial_ends_at)
  values (new.id, 'trial', 'trialing', 1, now() + interval '14 days')
  on conflict (organization_id) do nothing;
  return null;
end;
$$;

create trigger organizations_seed_trial
  after insert on public.organizations
  for each row execute function public.seed_trial_subscription();

-- Organizations that predate billing get the same 14 days from now.
insert into public.subscriptions (organization_id, plan, status, seats, trial_ends_at)
select o.id, 'trial', 'trialing',
       greatest((select count(*) from public.organization_members m where m.organization_id = o.id), 1),
       now() + interval '14 days'
from public.organizations o
on conflict (organization_id) do nothing;

revoke all on function public.seed_trial_subscription() from public, anon, authenticated;
