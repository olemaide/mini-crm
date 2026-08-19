import type { Database } from "@/types/database";

export type ActivityType = Database["public"]["Enums"]["activity_type"];

/** The four a human writes. Everything else is written by a database trigger. */
export const USER_AUTHORED_TYPES = [
  "note",
  "email_logged",
  "call_logged",
  "meeting_logged",
] as const satisfies readonly ActivityType[];

export type UserAuthoredType = (typeof USER_AUTHORED_TYPES)[number];

export function isUserAuthored(type: ActivityType): type is UserAuthoredType {
  return (USER_AUTHORED_TYPES as readonly string[]).includes(type);
}

export type ActivitySubjectKind = "contact" | "company" | "deal";

export type FeedItem = {
  id: number;
  type: ActivityType;
  body: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
  editedAt: string | null;
  actor: { id: string; name: string | null } | null;
  subject: { kind: ActivitySubjectKind; id: string; label: string | null };
};

export type FeedCursor = { occurredAt: string; id: number };

export type FeedPage = { items: FeedItem[]; nextCursor: FeedCursor | null };

/**
 * The filter chips.
 *
 * `system` is everything the user did not write, defined as the complement of
 * USER_AUTHORED_TYPES rather than as a hand-maintained second list — otherwise
 * adding an activity type in Phase 6 would silently make it invisible under
 * every filter.
 */
export const FEED_FILTERS = ["all", "notes", "emails", "calls", "system"] as const;

export type FeedFilter = (typeof FEED_FILTERS)[number];

export function typesForFilter(
  filter: FeedFilter,
  allTypes: readonly ActivityType[],
): ActivityType[] | null {
  switch (filter) {
    case "notes":
      return ["note"];
    case "emails":
      return ["email_logged"];
    case "calls":
      return ["call_logged", "meeting_logged"];
    case "system":
      return allTypes.filter((type) => !isUserAuthored(type));
    default:
      return null;
  }
}
