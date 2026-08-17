import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed `middleware` to `proxy`. It runs on the Node.js runtime
 * only — the edge runtime is not supported here.
 *
 * Two jobs:
 *   1. Refresh the Supabase session cookie so Server Components downstream see
 *      a valid user.
 *   2. Redirect optimistically, so an unauthenticated visitor gets the login
 *      page instead of a flash of the app shell.
 *
 * The redirect is **UX, not security**. Proxy runs before the route resolves
 * and its result is never consulted by the database. Authorization lives in the
 * layout/action layer and, ultimately, in Row Level Security. If this file were
 * deleted, the app would still be safe — just uglier.
 */

/** Prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/contacts",
  "/companies",
  "/pipeline",
  "/tasks",
  "/settings",
  "/onboarding",
];

/** Pages a signed-in user has no reason to see. */
const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Bring them back where they were headed after signing in.
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // /reset-password is deliberately absent from GUEST_ONLY_PATHS: arriving
  // there *requires* the session created by the recovery link.
  if (user && GUEST_ONLY_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

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
