/**
 * Parsing for list-view URL state.
 *
 * Filters, sort and page live in the URL so a view is shareable, survives a
 * reload, and works with browser back/forward (build plan, Phase 7).
 *
 * Everything here treats the query string as hostile input: `sort` is matched
 * against a closed allow-list before it can reach an ORDER BY, and page size is
 * clamped so `?pageSize=1000000` cannot be used to exhaust the server.
 */

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type SortDirection = "asc" | "desc";

export type ListParams<TSort extends string> = {
  page: number;
  pageSize: number;
  sort: TSort;
  direction: SortDirection;
  query: string | null;
  ownerId: string | null;
  companyId: string | null;
};

/** Next.js 16 hands `searchParams` in as a Promise; this is the resolved shape. */
export type ResolvedSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseListParams<TSort extends string>(
  searchParams: ResolvedSearchParams,
  allowedSorts: readonly TSort[],
  defaultSort: TSort,
): ListParams<TSort> {
  const rawPage = Number.parseInt(firstValue(searchParams.page) ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1;

  const rawPageSize = Number.parseInt(firstValue(searchParams.pageSize) ?? "", 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(rawPageSize)
    ? rawPageSize
    : DEFAULT_PAGE_SIZE;

  const rawSort = firstValue(searchParams.sort);
  const sort = allowedSorts.includes(rawSort as TSort) ? (rawSort as TSort) : defaultSort;

  const direction: SortDirection = firstValue(searchParams.dir) === "asc" ? "asc" : "desc";

  const rawQuery = firstValue(searchParams.q)?.trim() ?? "";
  const query = rawQuery === "" ? null : rawQuery.slice(0, 100);

  // Reject anything that is not a UUID rather than passing it to the database
  // and getting a 400 back as a broken page.
  const rawOwner = firstValue(searchParams.owner);
  const ownerId = rawOwner && UUID_RE.test(rawOwner) ? rawOwner : null;

  const rawCompany = firstValue(searchParams.company);
  const companyId = rawCompany && UUID_RE.test(rawCompany) ? rawCompany : null;

  return { page, pageSize, sort, direction, query, ownerId, companyId };
}

/** True when any filter is active — drives the "clear filters" affordance. */
export function hasActiveFilters(params: ListParams<string>): boolean {
  return Boolean(params.query || params.ownerId || params.companyId);
}
