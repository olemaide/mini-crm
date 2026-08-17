-- Case-insensitive company lookup by name.
--
-- Import resolves a company by domain first (already indexed, citext) and falls
-- back to the name. Without this index that fallback is a sequential scan
-- executed once per imported row — 5,000 rows against 500 companies is 2.5M
-- comparisons, which is the difference between a 30-second import and a
-- 10-minute one.

create index companies_org_lower_name_idx
  on public.companies (organization_id, lower(name));
