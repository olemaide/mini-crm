-- Sort support for the list views.
--
-- Sortable columns are a closed set precisely so each one can be indexed.
-- Allowing arbitrary ORDER BY from the client is how a list view quietly
-- becomes a sequential scan.
--
-- `id` is the tiebreaker in every index: without a total order, two rows with
-- equal sort keys can swap places between pages and a contact is shown twice
-- or skipped entirely.

create index contacts_org_name_idx
  on public.contacts (organization_id, last_name nulls last, first_name nulls last, id);

create index contacts_org_updated_idx
  on public.contacts (organization_id, updated_at desc, id);

create index companies_org_updated_idx
  on public.companies (organization_id, updated_at desc, id);

-- Existing coverage, for reference:
--   contacts_org_created_idx   (organization_id, created_at desc)   default sort
--   contacts_org_email_uniq    (organization_id, email) partial      email sort
--   companies_org_created_idx  (organization_id, created_at desc)   default sort
--   companies_org_name_idx     (organization_id, name)              name sort
