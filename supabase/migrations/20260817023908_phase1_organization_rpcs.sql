-- Organization bootstrap and invitation acceptance.
--
-- Both are security definer because both must write rows the caller has no
-- policy to write: a user creating their first organization is not yet a
-- member of it, and an invitee is not yet a member either. Every such function
-- re-derives the actor from auth.uid() and never trusts a caller-supplied id.

-- Marked stable, not immutable: unaccent() depends on a text-search dictionary
-- and is itself only stable.
create or replace function public.slugify(value text)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      lower(extensions.unaccent(coalesce(value, ''))),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

create or replace function public.create_organization(
  p_name text,
  p_locale text default 'en',
  p_timezone text default 'Europe/Berlin',
  p_currency char(3) default 'EUR'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_locale text := coalesce(p_locale, 'en');
  v_timezone text := coalesce(p_timezone, 'Europe/Berlin');
  v_currency char(3) := upper(coalesce(p_currency, 'EUR'));
  v_base text;
  v_slug text;
  v_org uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_name = '' or length(v_name) > 120 then
    raise exception 'Organization name must be between 1 and 120 characters'
      using errcode = '22023';
  end if;

  if v_locale not in ('en', 'de') then
    v_locale := 'en';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    raise exception 'Unknown timezone: %', v_timezone using errcode = '22023';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code' using errcode = '22023';
  end if;

  v_base := left(btrim(coalesce(nullif(public.slugify(v_name), ''), 'org'), '-'), 40);
  if v_base = '' then
    v_base := 'org';
  end if;
  v_slug := v_base;

  -- Retry on collision rather than pre-checking. A pre-check races with a
  -- concurrent signup picking the same company name; catching the unique
  -- violation is the only version that is actually correct.
  for i in 1..10 loop
    begin
      insert into public.organizations (name, slug, locale, timezone, currency)
      values (v_name, v_slug, v_locale, v_timezone, v_currency)
      returning id into v_org;
      exit;
    exception when unique_violation then
      v_slug := v_base || '-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6);
    end;
  end loop;

  if v_org is null then
    raise exception 'Could not allocate a unique organization slug' using errcode = '40001';
  end if;

  -- Same transaction as the insert above: an ownerless organization is never
  -- observable, even briefly.
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_actor, 'owner');

  update public.profiles
     set default_organization_id = coalesce(default_organization_id, v_org)
   where id = v_actor;

  return v_org;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
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

  -- One deliberately vague message for every failure mode below. Telling an
  -- attacker whether a token exists, is expired, or belongs to someone else
  -- turns this endpoint into an oracle.
  if v_invitation.id is null
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now()
  then
    raise exception 'Invitation not found or no longer valid' using errcode = 'P0002';
  end if;

  if v_invitation.email is distinct from v_actor_email then
    raise exception 'This invitation was issued for a different email address'
      using errcode = 'P0003';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_invitation.organization_id, v_actor, v_invitation.role)
  on conflict (organization_id, user_id) do nothing;

  update public.invitations
     set accepted_at = now(),
         accepted_by = v_actor
   where id = v_invitation.id;

  update public.profiles
     set default_organization_id = coalesce(default_organization_id, v_invitation.organization_id)
   where id = v_actor;

  return v_invitation.organization_id;
end;
$$;

revoke all on function public.create_organization(text, text, text, char) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organization(text, text, text, char) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
