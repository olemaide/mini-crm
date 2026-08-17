import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed `middleware` to `proxy`. It runs on the Node.js runtime
 * only — the edge runtime is not supported here.
 *
 * Responsibility is deliberately narrow: refresh the Supabase session cookie so
 * Server Components downstream see a valid user. Route protection is *not* done
 * here. Proxy runs before the route is known and cannot be trusted as the only
 * gate; authorization belongs in the layout/action layer, backed by RLS.
 *
 * Phase 1 adds an optimistic redirect for unauthenticated visitors hitting the
 * `(app)` group — as a UX nicety, not as the security boundary.
 */
export async function proxy(request: NextRequest) {
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Keeping the proxy off
     * these paths matters: each pass costs a Supabase token check.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$).*)",
  ],
};
