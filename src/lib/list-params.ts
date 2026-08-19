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

export const CONTACT_SOURCES = ["manual", "csv", "api"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export type ListParams<TSort extends string> = {
  page: number;
  pageSize: number;
  sort: TSort;
  direction: SortDirection;
  query: string | null;
  ownerId: string | null;
  companyId: string | null;
  source: ContactSource | null;
  /** Tri-state: true = must have one, false = must not, null = don't care. */
  hasEmail: boolean | null;
  /** Inclusive `YYYY-MM-DD` bounds on creation date, or null. */
  createdFrom: string | null;
  createdTo: string | null;
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

  const rawSource = firstValue(searchParams.source);
  const source = (CONTACT_SOURCES as readonly string[]).includes(rawSource ?? "")
    ? (rawSource as ContactSource)
    : null;

  const rawHasEmail = firstValue(searchParams.hasEmail);
  const hasEmail = rawHasEmail === "1" ? true : rawHasEmail === "0" ? false : null;

  return {
    page,
    pageSize,
    sort,
    direction,
    query,
    ownerId,
    companyId,
    source,
    hasEmail,
    createdFrom: parseDate(firstValue(searchParams.from)),
    createdTo: parseDate(firstValue(searchParams.to)),
  };
}

/**
 * Only accepts a calendar date, and only a real one.
 *
 * The regex alone would pass `2026-02-31`, which Postgres rejects at query time
 * and turns into a broken page rather than an empty list. Round-tripping
 * through `Date` is what actually validates it.
 */
function parseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** True when any filter is active — drives the "clear filters" affordance. */
export function hasActiveFilters(params: ListParams<string>): boolean {
  return Boolean(
    params.query ||
    params.ownerId ||
    params.companyId ||
    params.source ||
    params.hasEmail !== null ||
    params.createdFrom ||
    params.createdTo,
  );
}
