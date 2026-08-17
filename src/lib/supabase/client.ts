import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components. Anon key only — RLS applies.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
