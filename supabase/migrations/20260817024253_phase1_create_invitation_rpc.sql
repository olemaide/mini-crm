-- Invitation creation moves behind an RPC.
--
-- The first cut let an admin INSERT into invitations directly, which meant the
-- client chose the token. That is the wrong place for it: token strength would
-- depend on app code getting it right every time, and the raw token would pass
-- through the request body and any logging in between.
--
-- Generating it inside the database with gen_random_bytes means the token is
-- cryptographically strong by construction, is returned exactly once, and is
-- never stored anywhere in raw form.

drop policy if exists "admins can create invitations" on public.invitations;

create or replace function public.create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.org_role default 'member'
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email extensions.citext := lower(btrim(coalesce(p_email, '')));
  v_token text;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Definer functions bypass RLS, so authorization is this line's job.
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

  -- Re-inviting supersedes the previous link rather than colliding with the
  -- one-pending-per-email index. The old token stops working immediately,
  -- which is what an admin clicking "resend" expects.
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

revoke all on function public.create_invitation(uuid, text, public.org_role) from public, anon;
grant execute on function public.create_invitation(uuid, text, public.org_role) to authenticated;

comment on function public.create_invitation(uuid, text, public.org_role) is
  'Creates an invitation and returns the raw token exactly once. Only the hash is persisted.';
