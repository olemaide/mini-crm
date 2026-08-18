-- Target for the composite foreign key on deals.
--
-- companies already carries unique (organization_id, id) from Phase 2, which is
-- what makes a cross-tenant contact→company link unrepresentable rather than
-- merely forbidden. Deals reference contacts the same way, so contacts needs
-- the same anchor.

alter table public.contacts add constraint contacts_org_id_unique unique (organization_id, id);
