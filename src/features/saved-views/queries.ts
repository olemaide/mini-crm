import "server-only";

import { getSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const SAVED_VIEW_RESOURCES = ["contacts", "companies", "deals", "tasks"] as const;
export type SavedViewResource = (typeof SAVED_VIEW_RESOURCES)[number];

export type SavedView = { id: string; name: string; queryString: string };

/**
 * This user's saved views for one list.
 *
 * RLS already scopes to the owner; the explicit `user_id` filter is doing real
 * work rather than duplicating it, since the policy would still let the query
 * plan consider every row in the organization.
 */
export async function listSavedViews(resource: SavedViewResource): Promise<SavedView[]> {
  const session = await getSession();
  if (!session) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_views")
    .select("id, name, query_string")
    .eq("organization_id", session.organization.id)
    .eq("user_id", session.user.id)
    .eq("resource", resource)
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, name: row.name, queryString: row.query_string }));
}
