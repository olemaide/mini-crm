-- Tenant-isolation audit. Runs in CI against the staging database.
--
-- Why this exists: a missing RLS policy exposes one customer's contact database
-- to another. It is invisible in the UI, it is the one bug class that ends the
-- business rather than annoying a user, and automated E2E coverage is currently
-- deferred (build plan §1.4). This script is the standing guard.
--
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/rls-audit.sql
-- A non-zero exit means the build must fail.

\set ON_ERROR_STOP on

do $$
declare
  -- Tables legitimately without an organization_id. Every entry needs a reason.
  -- Adding to this list should be a conscious review decision, not a reflex.
  exempt_tables constant text[] := array[
    'health_check',   -- single-row liveness probe, no tenant data
    'organizations',  -- IS the tenant; scoped by its own id
    'profiles',       -- keyed to auth.users, scoped by user id
    'billing_events', -- raw webhook payloads, service-role only
    'rate_limits'     -- infrastructure counters, no personal data
  ];

  /*
   * Tables that are deliberately unreachable: RLS enabled with zero policies,
   * so no client role can read or write them at all.
   *
   * A separate list from `exempt_tables` on purpose. "No tenant column" and
   * "no policies whatsoever" are different claims, and a table that quietly
   * lost its policies must not pass because it happened to be exempt from the
   * other check. Every entry needs a reason.
   */
  no_policy_tables constant text[] := array[
    'billing_events', -- webhook log; written by the service role, read by nobody
    'rate_limits'     -- infrastructure counters; consume_rate_limit() is granted
                      -- to service_role alone, so no client role may touch them
  ];
  problems text[] := '{}';
  rec record;
begin
  for rec in
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
      exists (
        select 1
        from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.relname
          and col.column_name = 'organization_id'
      ) as has_org_id
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
    order by c.relname
  loop
    if not rec.rls_enabled then
      problems := problems || format('%s: RLS is not enabled', rec.table_name);
    elsif rec.policy_count = 0 and not (rec.table_name = any(no_policy_tables)) then
      problems := problems || format(
        '%s: RLS enabled but zero policies — the table is unreachable, which is probably not what you meant',
        rec.table_name
      );
    elsif rec.policy_count > 0 and rec.table_name = any(no_policy_tables) then
      -- The inverse is also a finding: a table listed as unreachable that has
      -- grown a policy has quietly become reachable.
      problems := problems || format(
        '%s: listed as deliberately unreachable but now has %s policies',
        rec.table_name, rec.policy_count
      );
    end if;

    if not rec.has_org_id and not (rec.table_name = any(exempt_tables)) then
      problems := problems || format(
        '%s: no organization_id column — add one, or add the table to exempt_tables with a written reason',
        rec.table_name
      );
    end if;
  end loop;

  if array_length(problems, 1) > 0 then
    raise exception E'RLS audit failed:\n  - %', array_to_string(problems, E'\n  - ');
  end if;

  raise notice 'RLS audit passed: every public table has RLS, at least one policy, and a tenant column.';
end
$$;
