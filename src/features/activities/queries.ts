import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActivitySubjectKind, ActivityType, FeedCursor, FeedItem, FeedPage } from "./types";

export const FEED_PAGE_SIZE = 25;

type RawItem = {
  id: number;
  type: ActivityType;
  body: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
  edited_at: string | null;
  actor: { id: string; name: string | null } | null;
  subject: { kind: ActivitySubjectKind; id: string; label: string | null };
};

/**
 * One page of the roll-up feed for a contact, company or deal.
 *
 * The RPC does the union and the keyset paging; this only reshapes the payload
 * into camelCase. An error returns an empty page rather than throwing, so a
 * feed that fails to load never takes the whole record page down with it.
 */
export async function getActivityFeed(
  subjectType: ActivitySubjectKind,
  subjectId: string,
  options: { types?: ActivityType[] | null; cursor?: FeedCursor | null; limit?: number } = {},
): Promise<FeedPage> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("activity_feed", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_types: options.types ?? undefined,
    p_before_occurred_at: options.cursor?.occurredAt ?? undefined,
    p_before_id: options.cursor?.id ?? undefined,
    p_limit: options.limit ?? FEED_PAGE_SIZE,
  });

  if (error || !data) return { items: [], nextCursor: null };

  const payload = data as unknown as {
    items: RawItem[];
    next_cursor: { occurred_at: string; id: number } | null;
  };

  const items: FeedItem[] = (payload.items ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    body: row.body,
    metadata: row.metadata ?? {},
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    actor: row.actor,
    subject: row.subject,
  }));

  return {
    items,
    nextCursor: payload.next_cursor
      ? { occurredAt: payload.next_cursor.occurred_at, id: payload.next_cursor.id }
      : null,
  };
}
