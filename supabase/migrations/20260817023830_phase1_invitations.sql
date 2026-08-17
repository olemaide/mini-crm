-- Invitations.
--
-- Delivery is out of scope: the app shows the inviting admin a one-time link to
-- pass along however they like. That removes an email provider from the
-- critical path entirely — the invite flow works on day one with no DNS,
-- no SPF/DKIM, and no deliverability problems.
--
-- Two consequences follow, and both are deliberate:
--
--   1. Only the SHA-256 hash of the token is stored. The link grants access to
--      a customer's contact database, so it is a credential. A leaked database
--      dump must not contain usable invite links. The raw token is shown to the
--      inviter exactly once and is unrecoverable afterwards.
--   2. Invitations are bound to an email address. Possession of the link is not
--      sufficient — the accepting user must be authenticated as that address.
--      A forwarded link is therefore useless to a third party.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email extensions.citext not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Ownership transfer is a separate, later concern. Keeping 'owner' out of
  -- invitations removes a whole class of escalation edge cases.
  role public.org_role not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one live invitation per address per organization. Re-inviting
-- someone means revoking the old one first, so a stale link cannot be
-- resurrected after the admin thinks they replaced it.
create unique index invitations_one_pending_per_email
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create index invitations_organization_idx on public.invitations (organization_id, created_at desc);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

alter table public.invitations enable row level security;

-- Only admins deal with invitations. The invitee never reads this table --
-- acceptance goes through a security-definer RPC, because by definition they
-- are not yet a member and no policy could grant them access.
create policy "admins can read invitations"
  on public.invitations for select to authenticated
  using (public.is_org_admin(organization_id));

create policy "admins can create invitations"
  on public.invitations for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy "admins can revoke invitations"
  on public.invitations for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy "admins can delete invitations"
  on public.invitations for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Immutable so it can be used in an index or comparison without replanning.
create or replace function public.hash_invitation_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

comment on table public.invitations is
  'Pending org invitations. Stores a token hash only; the raw link is shown once to the inviter.';
