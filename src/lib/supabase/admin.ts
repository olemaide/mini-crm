import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";

/**
 * Service-role Supabase client. **Bypasses Row Level Security entirely.**
 *
 * Legitimate uses are narrow: webhook handlers (Polar), scheduled jobs, and
 * signup bootstrapping — places where there is no authenticated user yet.
 *
 * Rules for every call site:
 *   1. Scope the query to one `organization_id` explicitly. RLS is not there to
 *      catch your mistake anymore; you are the only check.
 *   2. Never import this module from anything reachable by a Client Component.
 *   3. Never pass a user-supplied organization id without verifying membership.
 */
export function createSupabaseAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
