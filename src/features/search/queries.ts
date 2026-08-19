import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SearchKind = "contact" | "company" | "deal";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  label: string;
  sublabel: string;
  score: number;
  extra: {
    companyName?: string;
    valueCents?: number;
    currency?: string;
    status?: string;
  };
};

export type SearchResult = { items: SearchHit[]; tooShort: boolean };

/**
 * The ⌘K palette's one query.
 *
 * Everything — matching, accent folding, ranking, the union across three
 * tables — happens in `global_search`. Doing it in one round trip is the whole
 * point: three separate queries would each pay their own latency and then need
 * merging client-side with no shared score.
 */
export async function globalSearch(
  organizationId: string,
  query: string,
  limit = 20,
): Promise<SearchResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("global_search", {
    p_organization_id: organizationId,
    p_query: query,
    p_limit: limit,
  });

  if (error || !data) return { items: [], tooShort: false };

  const payload = data as unknown as { items: SearchHit[]; tooShort?: boolean };
  return { items: payload.items ?? [], tooShort: payload.tooShort === true };
}
