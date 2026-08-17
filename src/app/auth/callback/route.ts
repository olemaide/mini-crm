import { NextResponse, type NextRequest } from "next/server";

import { createRequestLogger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AFTER_LOGIN_PATH, LOGIN_PATH, ONBOARDING_PATH } from "@/lib/auth/constants";

/**
 * Exchanges an emailed auth code for a session.
 *
 * Handles every link Supabase sends: email confirmation, magic link and
 * password recovery. The `next` parameter decides where the user lands
 * afterwards — recovery links point at /reset-password, everything else at the
 * app.
 */
export async function GET(request: NextRequest) {
  const { log } = createRequestLogger({ route: "/auth/callback" });
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  // Relative paths only. `next` comes straight off the query string, so an
  // absolute URL here would make this an open redirect — and one that fires
  // *after* a valid session cookie has been set.
  const next = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  if (!code) {
    log.warn("auth callback hit without a code");
    return NextResponse.redirect(`${origin}${LOGIN_PATH}?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.warn({ code: error.code }, "auth code exchange failed");
    return NextResponse.redirect(`${origin}${LOGIN_PATH}?error=invalid_link`);
  }

  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Send brand-new accounts to onboarding, returning users to the app. The
  // (app) layout would bounce them to onboarding anyway; doing it here avoids
  // a visible flash of the empty shell.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { count } = await supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (!count) return NextResponse.redirect(`${origin}${ONBOARDING_PATH}`);
  }

  return NextResponse.redirect(`${origin}${AFTER_LOGIN_PATH}`);
}
