import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed `middleware` to `proxy`. It runs on the Node.js runtime
 * only — the edge runtime is not supported here.
 *
 * Three jobs:
 *   1. Refresh the Supabase session cookie so Server Components downstream see
 *      a valid user.
 *   2. Redirect optimistically, so an unauthenticated visitor gets the login
 *      page instead of a flash of the app shell.
 *   3. Issue a per-request Content-Security-Policy nonce (Phase 9).
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

/**
 * The Content-Security-Policy, built per request because the script nonce is.
 *
 * Why it lives here and not in `next.config.ts` headers: a nonce has to be
 * unpredictable per response, and static config cannot produce one. The cost is
 * real and worth stating — nonce-based CSP forces dynamic rendering, so no page
 * is statically optimised. This app is cookie-driven on every authenticated
 * route anyway, so the only pages that lose anything are the marketing and legal
 * ones, and those are cheap to render.
 *
 * Two directives are looser than the textbook version, both deliberately:
 *
 *   style-src ... 'unsafe-inline'
 *     A nonce cannot be attached to an inline `style` **attribute**, only to a
 *     <style> element. dnd-kit writes `style="transform: …"` on every dragged
 *     Kanban card and the import wizard's progress bar sets its own width, so a
 *     strict style-src would break the two most important screens in the
 *     product. Style injection is a defacement risk, not a code-execution one;
 *     script-src is where the actual protection is, and that one is strict.
 *
 *   img-src ... https:
 *     Avatar URLs come from OAuth providers and are not known ahead of time.
 *     Images cannot execute.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const isDev = env.NODE_ENV === "development";
  const supabaseOrigin = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;

  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets a nonced script load further scripts, which is how
    // the Next.js runtime bootstraps its chunks. Without it every chunk URL
    // would have to be allow-listed by hand.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    // next/font/google self-hosts at build time, so no font CDN is needed.
    "font-src 'self' data:",
    // The Supabase origin is the data plane: auth callbacks and any future
    // browser-side query go there and nowhere else. `ws:` is dev-only HMR.
    `connect-src 'self' ${supabaseOrigin}${isDev ? " ws: wss:" : ""}`,
    "form-action 'self'",
    "frame-src 'none'",
    // Belt and braces with the X-Frame-Options header in next.config.ts:
    // frame-ancestors is the modern directive, X-Frame-Options the fallback for
    // anything that predates it.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  // Omitted in development: localhost is served over http.
  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  /*
   * base64 of a v4 UUID. The requirement is unpredictability and uniqueness per
   * response, both of which `randomUUID()` provides from a CSPRNG.
   */
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce);

  /*
   * Next extracts the nonce from the *request*'s CSP header and stamps it onto
   * every script tag it emits, so both headers have to be forwarded inward —
   * `x-nonce` alone is not enough, and neither is setting them only on the
   * response.
   */
  const { response, user } = await updateSession(request, {
    "x-nonce": nonce,
    "content-security-policy": csp,
  });
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

  response.headers.set("Content-Security-Policy", csp);
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
