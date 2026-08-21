/*
 * Phase 9: a fixed-window rate limiter in Postgres.
 *
 * Why Postgres and not Redis/Upstash: the app runs on Netlify functions, so
 * there is no shared process memory to count in — two requests land on two
 * instances and an in-memory counter protects nothing. Adding a Redis is a
 * fourth subprocessor to name in the DPA (build plan §9, GDPR) for a counter
 * the database can hold in one row. The row is a single-page index lookup plus
 * one update; that is cheaper than the network hop to a separate service.
 *
 * Fixed window, not a sliding log. A sliding window needs a row per hit, which
 * turns a login flood into a write flood — precisely the wrong failure mode.
 * The cost is burstiness at the boundary: 2× the limit is reachable across two
 * adjacent windows. For "stop credential stuffing and runaway imports" that is
 * an acceptable trade, and it is a deliberate one rather than an oversight.
 *
 * No tenant column, and no RLS policies: these are infrastructure counters
 * holding a hashed key, never personal data. Both facts are recorded in
 * scripts/rls-audit.sql so the audit does not have to guess.
 */

create table public.rate_limits (
  /*
   * Opaque, caller-composed key: "auth.signIn:<sha256 of the email>",
   * "import.chunk:<org uuid>". Hashing the identifier at the call site is what
   * keeps an email address out of this table — see lib/rate-limit.ts. The
   * length cap stops an attacker growing the table with junk keys.
   */
  bucket text primary key check (length(bucket) between 1 and 200),
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.rate_limits is
  'Fixed-window rate-limit counters. Infrastructure only: no tenant column, no personal data, no RLS policies — the service role is the sole writer.';

-- Only used by the pruning job, which sweeps by age.
create index rate_limits_window_idx on public.rate_limits (window_started_at);

alter table public.rate_limits enable row level security;

/*
 * Counts one hit and reports whether it is allowed.
 *
 * `clock_timestamp()` rather than `now()`: now() is the transaction start time,
 * and a limiter that shares a timestamp across a long transaction drifts.
 *
 * The insert-with-on-conflict is one statement on purpose. A read-then-write
 * would let two concurrent requests both see hits = limit - 1 and both proceed,
 * which is the exact race a limiter exists to close.
 *
 * The denied request is still counted. That is standard fixed-window behaviour
 * and it means a client that keeps hammering stays locked out for the rest of
 * the window instead of getting a free hit every time the counter is read.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  -- Clamped rather than trusted: a caller passing 0 must not divide the window
  -- to nothing, and a negative limit must not lock everyone out permanently.
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_window interval := make_interval(secs => least(greatest(coalesce(p_window_seconds, 60), 1), 86400));
  v_key text := left(btrim(coalesce(p_bucket, '')), 200);
  v_row public.rate_limits;
begin
  if v_key = '' then
    raise exception 'A rate-limit bucket is required' using errcode = '22023';
  end if;

  insert into public.rate_limits as rl (bucket, window_started_at, hits, updated_at)
  values (v_key, v_now, 1, v_now)
  on conflict (bucket) do update
    set
      -- Window expired: start a fresh one at 1. Otherwise increment in place.
      hits = case
               when rl.window_started_at + v_window <= v_now then 1
               else rl.hits + 1
             end,
      window_started_at = case
                            when rl.window_started_at + v_window <= v_now then v_now
                            else rl.window_started_at
                          end,
      updated_at = v_now
  returning * into v_row;

  return jsonb_build_object(
    'allowed', v_row.hits <= v_limit,
    'limit', v_limit,
    'hits', v_row.hits,
    'remaining', greatest(v_limit - v_row.hits, 0),
    -- Whole seconds, rounded up: a client told to wait 0 retries immediately.
    'retryAfterSeconds', greatest(
      ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer,
      1
    )
  );
end;
$$;

comment on function public.consume_rate_limit(text, integer, integer) is
  'Counts one hit in a fixed window and returns {allowed, limit, hits, remaining, retryAfterSeconds}. Service role only.';

/*
 * Housekeeping.
 *
 * Rows are tiny but unbounded — one per distinct key ever seen. A daily sweep
 * keeps the table at the size of "keys active today" rather than "keys ever".
 *
 * Deliberately not scheduled here. pg_cron is available on the Supabase project
 * but is not installed, and `create extension pg_cron` in a migration would fail
 * the CI RLS audit, which replays these files against a plain postgres:17 image.
 * Scheduling it is a one-line dashboard step, recorded in RELEASE-CHECKLIST.md:
 *
 *   select cron.schedule('prune-rate-limits', '17 3 * * *',
 *                        $$select public.prune_rate_limits()$$);
 */
create or replace function public.prune_rate_limits(p_older_than interval default interval '1 day')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
   where window_started_at < clock_timestamp() - greatest(p_older_than, interval '1 minute');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

/*
 * The limiter is called with the service-role client, never from the browser.
 *
 * Granting `authenticated` would let any signed-in user burn another user's
 * budget by calling the RPC with their bucket key — the counter would become a
 * weapon rather than a defence.
 */
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.prune_rate_limits(interval) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.prune_rate_limits(interval) to service_role;
