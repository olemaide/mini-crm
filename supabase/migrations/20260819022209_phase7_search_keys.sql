/*
 * Accent-folded search keys.
 *
 * `unaccent(text)` is only STABLE — it resolves the dictionary through
 * search_path at run time — so Postgres refuses it in an index expression.
 * Naming the dictionary explicitly as a `regdictionary` freezes it to an OID at
 * parse time, which is what makes the wrapper safely IMMUTABLE. This is the
 * documented workaround and the reason the whole phase hangs together: without
 * it, every accent-insensitive search is a sequential scan.
 */
create or replace function public.immutable_unaccent(p_value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_value);
$$;

/*
 * The one transformation applied to both sides of every comparison.
 *
 * Folding accents matters more here than the interface language does: an
 * English speaker searching a German contact database must find `Müller` by
 * typing `muller`, and a German must find `Sørensen` by typing `sorensen`.
 * Because it is applied to the stored value and the needle alike, the two can
 * never disagree.
 *
 * The TypeScript twin is lib/search/fold.ts. If the two drift, search silently
 * stops matching — which is why the fixtures compare them.
 */
create or replace function public.search_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.immutable_unaccent(lower(btrim(coalesce(p_value, ''))));
$$;

/*
 * The old trigram indexes were on the raw columns, so they could only match
 * case- and accent-sensitively — the wrong shape for this phase, and reported
 * as never used by the advisor. Replaced rather than added to.
 */
drop index public.contacts_name_trgm_idx;
drop index public.companies_name_trgm_idx;
drop index public.deals_title_trgm_idx;

-- GIN trigram indexes. These accelerate `LIKE '%needle%'`, which is what the
-- search actually issues, for needles of three characters or more.
create index contacts_search_name_idx on public.contacts
  using gin (public.search_key(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
             extensions.gin_trgm_ops);
create index contacts_search_email_idx on public.contacts
  using gin (public.search_key(email::text) extensions.gin_trgm_ops);
create index companies_search_name_idx on public.companies
  using gin (public.search_key(name) extensions.gin_trgm_ops);
create index companies_search_domain_idx on public.companies
  using gin (public.search_key(domain::text) extensions.gin_trgm_ops);
create index deals_search_title_idx on public.deals
  using gin (public.search_key(title) extensions.gin_trgm_ops);

/*
 * Prefix indexes, for the first one or two characters.
 *
 * A trigram index cannot help with a needle shorter than three characters —
 * there are not enough trigrams — and typing two letters is exactly what
 * people do first. `text_pattern_ops` is required for `LIKE 'a%'` to be an
 * index range scan under a non-C collation.
 */
create index contacts_search_name_prefix_idx on public.contacts
  (public.search_key(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) text_pattern_ops);
create index contacts_search_email_prefix_idx on public.contacts
  (public.search_key(email::text) text_pattern_ops);
create index companies_search_name_prefix_idx on public.companies
  (public.search_key(name) text_pattern_ops);
create index deals_search_title_prefix_idx on public.deals
  (public.search_key(title) text_pattern_ops);

revoke all on function public.immutable_unaccent(text) from public, anon;
revoke all on function public.search_key(text) from public, anon;
grant execute on function public.immutable_unaccent(text) to authenticated;
grant execute on function public.search_key(text) to authenticated;

comment on function public.search_key(text) is
  'Lower-cased, accent-folded, trimmed. Applied to both the stored value and the needle so they cannot disagree. IMMUTABLE, so it can be indexed.';
