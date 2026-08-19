/*
 * Entitlements, derived — never stored.
 *
 * Same rule as "overdue" in Phase 6: a plan that has expired is a fact about
 * the clock, and a stored `is_active` flag is correct only until the moment it
 * matters. Everything below is computed from `subscriptions` at read time.
 */

-- Grace period after a failed payment: read-only with a banner, then blocked.
-- Data is never deleted, only frozen.
create or replace function public.billing_grace_days()
returns integer language sql immutable parallel safe as $$ select 7 $$;

/*
 * Is this organization inside a paid or trial window?
 *
 * `canceled` still returns true until current_period_end — someone who has paid
 * to the end of the month keeps the month they paid for.
 */
create or replace function public.org_has_write_access(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.organization_id is null then false
    when s.plan = 'trial' then coalesce(s.trial_ends_at, '-infinity'::timestamptz) > now()
    when s.plan in ('starter', 'pro') then true
    when s.plan = 'past_due'
      then now() < coalesce(s.current_period_end, s.updated_at)
                   + (public.billing_grace_days() || ' days')::interval
    when s.plan = 'canceled' then coalesce(s.current_period_end, '-infinity'::timestamptz) > now()
    else false
  end
  from public.subscriptions s
  where s.organization_id = p_organization_id;
$$;

/*
 * Contacts allowed on the current plan; null means unlimited.
 *
 * A lapsed trial keeps the Starter allowance rather than dropping to zero: the
 * point of read-only is that existing data stays visible and intact.
 */
create or replace function public.plan_contact_limit(p_organization_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.plan = 'pro' then null
    when s.plan = 'trial' and coalesce(s.trial_ends_at, '-infinity'::timestamptz) > now() then null
    else 2500
  end
  from public.subscriptions s
  where s.organization_id = p_organization_id;
$$;

/*
 * The hard limit, enforced in the database.
 *
 * UI gating is bypassed by anyone who can issue a PostgREST request, which is
 * every signed-in user — so the limit that actually protects the business has
 * to live here.
 *
 * The count is bounded by `limit v_limit + 1`: it stops as soon as it knows the
 * answer instead of counting every contact in the tenant. Statement-level, so a
 * 500-row import chunk pays for one bounded count rather than 500.
 */
create or replace function public.enforce_contact_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  v_limit integer;
  v_count integer;
begin
  for rec in select organization_id from new_rows group by organization_id loop
    if not public.org_has_write_access(rec.organization_id) then
      raise exception 'Subscription is not active' using errcode = 'P0007';
    end if;

    v_limit := public.plan_contact_limit(rec.organization_id);
    if v_limit is not null then
      select count(*) into v_count
        from (
          select 1 from public.contacts c
           where c.organization_id = rec.organization_id
           limit v_limit + 1
        ) bounded;

      if v_count > v_limit then
        raise exception 'Contact limit reached for this plan' using errcode = 'P0006';
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create trigger contacts_enforce_limit
  after insert on public.contacts
  referencing new table as new_rows
  for each statement execute function public.enforce_contact_limit();

/*
 * The same access gate on the other two things a lapsed tenant might create.
 *
 * Not a general write block — that would need a trigger on every table and
 * would still be defence in depth behind the Server Action check. These are the
 * paths that grow the data a plan is priced on.
 */
create or replace function public.enforce_write_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  for rec in select organization_id from new_rows group by organization_id loop
    if not public.org_has_write_access(rec.organization_id) then
      raise exception 'Subscription is not active' using errcode = 'P0007';
    end if;
  end loop;
  return null;
end;
$$;

create trigger companies_enforce_write_access
  after insert on public.companies
  referencing new table as new_rows
  for each statement execute function public.enforce_write_access();

create trigger deals_enforce_write_access
  after insert on public.deals
  referencing new table as new_rows
  for each statement execute function public.enforce_write_access();

/*
 * Everything the app needs to render billing state, in one row.
 *
 * security invoker, so RLS on `subscriptions` decides whether the caller sees
 * anything at all.
 */
create or replace function public.billing_state(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', s.plan,
    'status', s.status,
    'seats', s.seats,
    'members', (
      select count(*) from public.organization_members m
       where m.organization_id = s.organization_id
    ),
    'trialEndsAt', s.trial_ends_at,
    'currentPeriodEnd', s.current_period_end,
    'cancelAtPeriodEnd', s.cancel_at_period_end,
    'hasWriteAccess', public.org_has_write_access(s.organization_id),
    'contactLimit', public.plan_contact_limit(s.organization_id),
    'contactCount', (
      select count(*) from public.contacts c
       where c.organization_id = s.organization_id
    ),
    'polarCustomerId', s.polar_customer_id,
    'polarSubscriptionId', s.polar_subscription_id
  )
  from public.subscriptions s
  where s.organization_id = p_organization_id;
$$;

revoke all on function public.enforce_contact_limit() from public, anon, authenticated;
revoke all on function public.enforce_write_access() from public, anon, authenticated;
revoke all on function public.org_has_write_access(uuid) from public, anon;
revoke all on function public.plan_contact_limit(uuid) from public, anon;
revoke all on function public.billing_state(uuid) from public, anon;
grant execute on function public.org_has_write_access(uuid) to authenticated;
grant execute on function public.plan_contact_limit(uuid) to authenticated;
grant execute on function public.billing_state(uuid) to authenticated;
