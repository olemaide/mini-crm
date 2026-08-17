import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. **Bypasses Row Level Security entirely.**
 *
 * Legitimate uses are narrow: webhook handlers (Polar), scheduled jobs, and any
 * flow where there is no authenticated user yet.
 *
 * Rules for every call site:
 *   1. Scope the query to one `organization_id` explicitly. RLS is not there to
 *      catch your mistake anymore; you are the only check.
 *   2. Never import this module from anything reachable by a Client Component.
 *   3. Never pass a user-supplied organization id without verifying membership.
 *
 * Note that `guard_membership_changes()` deliberately trusts callers with no
 * JWT — so a careless service-role write can also bypass the last-owner and
 * role-escalation invariants, not just RLS.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
