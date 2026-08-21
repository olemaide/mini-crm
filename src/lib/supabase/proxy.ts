import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";

/**
 * Refreshes the Supabase auth session on every matched request and returns both
 * the response carrying the rotated cookies and the current user.
 *
 * Called from `src/proxy.ts` (Next.js 16 renamed `middleware` to `proxy`).
 *
 * Two rules that are easy to get wrong and expensive to debug:
 *   1. `getUser()` must actually be awaited. It is what revalidates the token
 *      with Supabase; skipping it silently leaves expired sessions in place.
 *   2. The returned response object must be the one that reaches the browser.
 *      Constructing a fresh `NextResponse` afterwards drops the refreshed
 *      cookies and logs the user out at random intervals.
 *
 * `extraRequestHeaders` exists for the CSP nonce (Phase 9). It cannot simply be
 * set on `request.headers` by the caller: the headers have to be re-read *after*
 * `request.cookies.set()` has rewritten the cookie header, or a session refresh
 * in the same pass loses the rotated cookies. Hence the thunk below rather than
 * a header snapshot taken once.
 */
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders: Record<string, string> = {},
) {
  const nextWithHeaders = () => {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(extraRequestHeaders)) headers.set(key, value);
    return NextResponse.next({ request: { headers } });
  };

  let response = nextWithHeaders();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = nextWithHeaders();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
