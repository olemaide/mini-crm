-- Covering indexes for the owner_id foreign keys.
--
-- `contacts_org_owner_idx` leads with organization_id, which serves the "my
-- contacts" filter but not referential integrity. When a profile is deleted,
-- Postgres runs `where owner_id = $1` to apply ON DELETE SET NULL — with no
-- leading-column index that is a sequential scan, executed inside a
-- transaction holding locks on auth.users.
--
-- Harmless at 10k rows, a genuine outage at a million. Two small indexes now.
--
-- Deliberately NOT added for invitations.accepted_by / invited_by: that table
-- stays in the hundreds of rows, where a sequential scan is cheaper than
-- maintaining an index. The advisor will keep flagging them; this comment is
-- the answer.

create index contacts_owner_idx on public.contacts (owner_id)
  where owner_id is not null;

create index companies_owner_idx on public.companies (owner_id)
  where owner_id is not null;
