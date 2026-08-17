-- Function privileges.
--
-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST exposes every
-- function in the `public` schema as an RPC endpoint. Combined with SECURITY
-- DEFINER that is how a helper becomes a privilege-escalation hole, so each
-- function below is revoked and then granted back only where genuinely needed.

-- ---- trigger functions: never callable directly ----
-- Triggers fire in the table owner's context and do not consult the invoking
-- user's EXECUTE privilege, so removing these grants costs nothing.
-- (Verified: signup still creates a profile with these revoked.)

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_membership_changes() from public, anon, authenticated;

-- ---- internal helpers: not part of the client API ----

revoke all on function public.slugify(text) from public, anon, authenticated;
revoke all on function public.hash_invitation_token(text) from public, anon, authenticated;

-- ---- RLS helpers ----
--
-- These MUST stay executable by `authenticated`: an RLS policy expression is
-- evaluated with the querying user's privileges, so revoking EXECUTE here would
-- lock every member out of their own data.
--
-- Direct callability is acceptable because each one answers only a question
-- about the caller themselves — "am I a member of X", "what is my role in X".
-- None can be used to enumerate other tenants. That property is what makes the
-- advisor warning benign here, and it must be preserved if these are ever
-- edited: a helper that reports on *another* user would need revoking.

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.org_role_of(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_owner(uuid) from public, anon;
revoke all on function public.shares_organization_with(uuid) from public, anon;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.org_role_of(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.shares_organization_with(uuid) to authenticated;

-- ---- intentional client RPCs ----

revoke all on function public.create_organization(text, text, text, char) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organization(text, text, text, char) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
