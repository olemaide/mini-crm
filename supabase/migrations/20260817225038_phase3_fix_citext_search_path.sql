/*
 * Fixes case-insensitive comparison in functions that touch citext columns.
 *
 * THE BUG: `set search_path = ''` — added everywhere to satisfy the security
 * advisor — also hides the citext `=` operator, which lives in the extensions
 * schema. Postgres then resolves the comparison against text instead and it
 * becomes CASE SENSITIVE, silently.
 *
 *     search_path = ''            'anna@x.test'::citext = 'ANNA@X.TEST'::citext  -> false
 *     search_path = 'extensions'  same expression                                -> true
 *
 * No error, no warning. The unique index still behaves correctly because an
 * index uses the type's operator class directly, so the failure mode is the
 * worst kind: application-level dedupe misses a duplicate, then the insert
 * blows up on the constraint. Caught by an import test where a row spelled
 * ANNA@FIRMA-A.EXAMPLE was reported as an error instead of being skipped by the
 * duplicate policy.
 *
 * THE FIX: `set search_path = 'extensions'` on every function comparing citext.
 * Still explicit and immutable, so the advisor stays satisfied, and still safe:
 * `extensions` is owned by the platform and not writable by application roles,
 * and every reference in these bodies is schema-qualified anyway. pg_catalog is
 * always searched first regardless.
 *
 * Also note accept_invitation was only ever working by accident — both sides
 * happened to be lowercase because create_invitation lowercases on write and
 * Supabase lowercases auth.users.email. That is an invariant nobody wrote down.
 * Now it is correct by construction instead of by luck.
 */

-- ------------------------------------------------------------- invitations

create or replace function public.create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.org_role default 'member'
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = 'extensions'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email extensions.citext := lower(btrim(coalesce(p_email, '')));
  v_token text;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_org_admin(p_organization_id) then
    raise exception 'Only an admin can invite members' using errcode = '42501';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email address is required' using errcode = '22023';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invitations may only grant the admin or member role'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and u.email = v_email
  ) then
    raise exception 'That person is already a member of this organization'
      using errcode = 'P0004';
  end if;

  update public.invitations
     set revoked_at = now()
   where organization_id = p_organization_id
     and email = v_email
     and accepted_at is null
     and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations (
    organization_id, email, role, token_hash, expires_at, invited_by
  )
  values (
    p_organization_id, v_email, p_role,
    public.hash_invitation_token(v_token),
    now() + interval '7 days',
    v_actor
  )
  returning id into invitation_id;

  token := v_token;
  return next;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = 'extensions'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_email extensions.citext;
  v_invitation public.invitations;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Invitation not found or no longer valid' using errcode = 'P0002';
  end if;

  select u.email into v_actor_email from auth.users u where u.id = v_actor;

  select * into v_invitation
    from public.invitations inv
   where inv.token_hash = public.hash_invitation_token(p_token)
   for update;

  if v_invitation.id is null
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now()
  then
    raise exception 'Invitation not found or no longer valid' using errcode = 'P0002';
  end if;

  -- Now genuinely case-insensitive, not merely lowercase-on-both-sides.
  if v_invitation.email is distinct from v_actor_email then
    raise exception 'This invitation was issued for a different email address'
      using errcode = 'P0003';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_invitation.organization_id, v_actor, v_invitation.role)
  on conflict (organization_id, user_id) do nothing;

  update public.invitations
     set accepted_at = now(), accepted_by = v_actor
   where id = v_invitation.id;

  update public.profiles
     set default_organization_id = coalesce(default_organization_id, v_invitation.organization_id)
   where id = v_actor;

  return v_invitation.organization_id;
end;
$$;

create or replace function public.preview_invitation(p_token text)
returns table (organization_name text, email text, role public.org_role)
language sql
stable
security definer
set search_path = 'extensions'
as $$
  select o.name, inv.email::text, inv.role
  from public.invitations inv
  join public.organizations o on o.id = inv.organization_id
  where inv.token_hash = public.hash_invitation_token(p_token)
    and inv.accepted_at is null
    and inv.revoked_at is null
    and inv.expires_at > now();
$$;

create or replace function public.hash_invitation_token(p_token text)
returns text
language sql
immutable
set search_path = 'extensions'
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.slugify(value text)
returns text
language sql
stable
set search_path = 'extensions'
as $$
  select btrim(
    regexp_replace(lower(extensions.unaccent(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
$$;

-- ------------------------------------------------------------- import paths

create or replace function public.preview_import_duplicates(
  p_organization_id uuid,
  p_emails text[] default '{}',
  p_phones text[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = 'extensions'
as $$
declare
  v_email_matches integer := 0;
  v_phone_matches integer := 0;
  v_sample text[] := '{}';
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if coalesce(array_length(p_emails, 1), 0) > 20000
     or coalesce(array_length(p_phones, 1), 0) > 20000 then
    raise exception 'Too many values' using errcode = '22023';
  end if;

  select count(*)::integer,
         coalesce((array_agg(c.email::text order by c.email))[1:20], '{}')
    into v_email_matches, v_sample
    from public.contacts c
    join unnest(p_emails) as e(value) on c.email = e.value::extensions.citext
   where c.organization_id = p_organization_id;

  select count(*)::integer
    into v_phone_matches
    from public.contacts c
    join unnest(p_phones) as p(value) on c.phone = p.value
   where c.organization_id = p_organization_id
     and c.phone is not null;

  return jsonb_build_object(
    'email_matches', coalesce(v_email_matches, 0),
    'phone_matches', coalesce(v_phone_matches, 0),
    'sample', to_jsonb(v_sample)
  );
end;
$$;

revoke all on function public.create_invitation(uuid, text, public.org_role) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.preview_invitation(text) from public;
revoke all on function public.hash_invitation_token(text) from public, anon, authenticated;
revoke all on function public.slugify(text) from public, anon, authenticated;
revoke all on function public.preview_import_duplicates(uuid, text[], text[]) from public, anon;

grant execute on function public.create_invitation(uuid, text, public.org_role) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.preview_invitation(text) to anon, authenticated;
grant execute on function public.preview_import_duplicates(uuid, text[], text[]) to authenticated;
