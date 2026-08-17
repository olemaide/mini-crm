-- Lets the invitation landing page name the organization before the visitor
-- commits to joining, and before they have any membership to read it with.
--
-- Safe to expose to anon: it requires the 32-byte token, which is already the
-- credential. Returning zero rows for anything invalid — rather than a reason —
-- keeps it from becoming an oracle for probing token or account existence.
--
-- The invited email is returned so the page can say "sign in as x@y.com"
-- instead of failing confusingly after the user signs in as someone else.

create or replace function public.preview_invitation(p_token text)
returns table (
  organization_name text,
  email text,
  role public.org_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, inv.email::text, inv.role
  from public.invitations inv
  join public.organizations o on o.id = inv.organization_id
  where inv.token_hash = public.hash_invitation_token(p_token)
    and inv.accepted_at is null
    and inv.revoked_at is null
    and inv.expires_at > now();
$$;

revoke all on function public.preview_invitation(text) from public;
grant execute on function public.preview_invitation(text) to anon, authenticated;

comment on function public.preview_invitation(text) is
  'Returns the org name and invited address for a valid token, or zero rows. Requires possession of the token.';
