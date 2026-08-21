/*
 * Phase 9 / DSGVO Art. 17: erasure, with a grace period.
 *
 * What was here before: a policy letting any owner run
 * `delete from organizations where id = …` straight through PostgREST. It
 * worked, it cascaded correctly, and it was reachable from the browser console
 * with no confirmation, no export and no way back. One mis-click or one stolen
 * owner session and a customer's entire CRM was gone.
 *
 * Erasure is now a two-step: an owner *schedules* it, and a sweep carries it out
 * after the grace period. That satisfies "within 30 days" (Art. 17 does not
 * require *immediate* deletion) while leaving a window in which a mistake is
 * still a mistake rather than a catastrophe.
 */

/*
 * `set search_path = ''` even though this returns a constant and references
 * nothing. Phase 8 shipped billing_grace_days() without it, the security advisor
 * flagged it, and it needed a follow-up migration to pin. "Every function pins
 * its search_path" is only a useful rule if it has no exceptions to argue about.
 */
create or replace function public.deletion_grace_days()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$ select 30 $$;

alter table public.organizations
  add column deletion_requested_at timestamptz,
  add column deletion_requested_by uuid references public.profiles(id) on delete set null,
  add column deletion_scheduled_for timestamptz;

comment on column public.organizations.deletion_scheduled_for is
  'When the purge sweep may delete this tenant and everything under it. Null means no deletion is pending. Written only by request_organization_deletion() / cancel_organization_deletion().';

-- The sweep asks "anything due yet?" and nothing else, so a partial index over
-- the handful of pending rows is all it needs.
create index organizations_deletion_due_idx
  on public.organizations (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

/*
 * No covering index on deletion_requested_by, and the advisor will keep flagging
 * it — this comment is the answer, same as for invitations.invited_by in
 * phase2_owner_fk_indexes.sql.
 *
 * The rule there was: index an FK when the ON DELETE scan happens on a table
 * large enough for a sequential scan to hurt, while holding locks on auth.users.
 * `organizations` holds one row per tenant, which is the smallest table in the
 * schema — and the column is null for every row that has not scheduled deletion,
 * which is all of them. An index here would cost writes to serve a scan that is
 * already a single page.
 */

/*
 * The three deletion columns are not ordinary settings.
 *
 * `admins can update their organization` is a table-wide UPDATE policy, so
 * without this trigger an admin could set `deletion_scheduled_for` to now() with
 * a single PostgREST call and skip both the confirmation and the grace period —
 * exactly the hole the two-step was meant to close.
 *
 * The transaction-local GUC is the gate. It can only be set from inside a
 * security-definer function in this file; a client of PostgREST has no way to
 * run `set_config`, so possessing an admin token buys nothing here.
 */
create or replace function public.guard_organization_deletion_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
       new.deletion_requested_at is distinct from old.deletion_requested_at
    or new.deletion_requested_by is distinct from old.deletion_requested_by
    or new.deletion_scheduled_for is distinct from old.deletion_scheduled_for
     )
    and coalesce(current_setting('app.deletion_guard', true), '') <> 'open'
  then
    raise exception 'Deletion is scheduled through request_organization_deletion()'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger organizations_guard_deletion_columns
  before update on public.organizations
  for each row execute function public.guard_organization_deletion_columns();

/*
 * Schedules erasure. Owners only, and the owner must retype the organization's
 * name — the same friction GitHub and Stripe use, for the same reason: the
 * confirmation has to be impossible to click through by muscle memory.
 *
 * Returns the date the purge becomes due, so the UI can say it rather than
 * recomputing the grace period on the client and drifting from the database.
 */
create or replace function public.request_organization_deletion(
  p_organization_id uuid,
  p_confirm_name text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_due timestamptz;
begin
  if not public.is_org_owner(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select o.name into v_name from public.organizations o where o.id = p_organization_id;
  if v_name is null then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  -- Case- and whitespace-insensitive: the check is "do you know what you are
  -- deleting", not a typing test.
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_name)) then
    raise exception 'The organization name does not match' using errcode = 'P0008';
  end if;

  v_due := now() + (public.deletion_grace_days() || ' days')::interval;

  perform set_config('app.deletion_guard', 'open', true);
  update public.organizations
     set deletion_requested_at = now(),
         deletion_requested_by = (select auth.uid()),
         deletion_scheduled_for = v_due
   where id = p_organization_id;
  perform set_config('app.deletion_guard', '', true);

  return v_due;
end;
$$;

/*
 * Calls it off. Also owners only: an admin who cannot schedule erasure has no
 * business overriding an owner's decision to go through with it.
 */
create or replace function public.cancel_organization_deletion(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_owner(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  perform set_config('app.deletion_guard', 'open', true);
  update public.organizations
     set deletion_requested_at = null,
         deletion_requested_by = null,
         deletion_scheduled_for = null
   where id = p_organization_id;
  perform set_config('app.deletion_guard', '', true);
end;
$$;

/*
 * The sweep. Deleting the organization row cascades to every tenant table —
 * that is what the `on delete cascade` on each organization_id has been for
 * since Phase 1, and it is why this function is four lines rather than twenty
 * delete statements that could fall out of step with the schema.
 *
 * auth.users rows are deliberately left alone. A person may belong to several
 * organizations, and erasing the tenant must not sign them out of someone
 * else's. Deleting an individual account is a separate request under Art. 17
 * and is handled from the Supabase dashboard.
 *
 * Not scheduled from a migration: pg_cron is available on the project but not
 * installed, and creating the extension here would fail the CI RLS audit, which
 * replays these files against a plain postgres:17 image. Enabling it is one
 * dashboard step, recorded in RELEASE-CHECKLIST.md:
 *
 *   select cron.schedule('purge-deleted-orgs', '0 4 * * *',
 *                        $$select public.purge_due_organizations()$$);
 */
create or replace function public.purge_due_organizations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.organizations o
   where o.deletion_scheduled_for is not null
     and o.deletion_scheduled_for <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

/*
 * The direct delete path is gone.
 *
 * Leaving it would make every guard above optional — an owner could still wipe
 * the tenant in one PostgREST call. The purge function is a security definer, so
 * it deletes without needing a policy of its own.
 */
drop policy if exists "owners can delete their organization" on public.organizations;

revoke all on function public.guard_organization_deletion_columns() from public, anon, authenticated;
revoke all on function public.request_organization_deletion(uuid, text) from public, anon;
revoke all on function public.cancel_organization_deletion(uuid) from public, anon;
revoke all on function public.purge_due_organizations() from public, anon, authenticated;
grant execute on function public.request_organization_deletion(uuid, text) to authenticated;
grant execute on function public.cancel_organization_deletion(uuid) to authenticated;
grant execute on function public.purge_due_organizations() to service_role;
