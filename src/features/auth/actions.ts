"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { fail, ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { ACTIVE_ORG_COOKIE, AFTER_LOGIN_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { byEmail, consumeRateLimit, type RateLimitName } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/i18n/config";
import {
  magicLinkSchema,
  resetPasswordRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "./schema";

/**
 * Maps Supabase auth errors onto message keys.
 *
 * Supabase's own strings are English-only and change between releases, so they
 * are never surfaced directly. Note that invalid-email and invalid-password
 * both collapse to `invalidCredentials`: distinguishing them would turn the
 * login form into an account-enumeration oracle.
 */
function authErrorKey(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "invalid_credentials":
    case "invalid_grant":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "emailInUse";
    case "weak_password":
      return "weakPassword";
    case "signup_disabled":
      return "signupDisabled";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rateLimited";
    case "same_password":
      return "samePassword";
    default:
      if (status === 429) return "rateLimited";
      return "unexpected";
  }
}

/**
 * Trips the limiter for one email address, returning a failure to hand back.
 *
 * Keyed on the address rather than the IP: see lib/rate-limit.ts. The same
 * `rateLimited` key Supabase's own 429 maps to, so a user cannot tell which
 * layer stopped them — and does not need to, since the advice is identical.
 */
async function checkAuthRateLimit(
  rule: RateLimitName,
  email: string,
): Promise<ActionResult<never> | null> {
  const result = await consumeRateLimit(rule, byEmail(email));
  return result.allowed ? null : fail("rateLimited");
}

/**
 * Absolute base URL for auth redirect links.
 *
 * Prefers the request's own origin so deploy previews link back to themselves
 * instead of production. Only hosts we control are accepted — an attacker who
 * can set the Host header must not be able to redirect a password-reset link to
 * their own domain.
 */
async function resolveSiteUrl(): Promise<string> {
  const configured = new URL(env.NEXT_PUBLIC_APP_URL);
  const headerList = await headers();
  const forwardedHost = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!forwardedHost) return configured.origin;

  const proto = headerList.get("x-forwarded-proto") ?? "https";
  try {
    const candidate = new URL(`${proto}://${forwardedHost}`);
    const allowed =
      candidate.hostname === configured.hostname ||
      candidate.hostname === "localhost" ||
      candidate.hostname === "127.0.0.1" ||
      candidate.hostname.endsWith(".netlify.app");
    return allowed ? candidate.origin : configured.origin;
  } catch {
    return configured.origin;
  }
}

export async function signIn(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("auth.signIn", async () => {
    const parsed = parseInput(signInSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const limited = await checkAuthRateLimit("auth.signIn", parsed.data.email);
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) return fail(authErrorKey(error.code, error.status));
    return ok();
  });
}

export async function signUp(
  input: unknown,
): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  return runAction("auth.signUp", async () => {
    const parsed = parseInput(signUpSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const limited = await checkAuthRateLimit("auth.signUp", parsed.data.email);
    if (limited) return limited;

    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
    const siteUrl = await resolveSiteUrl();

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        // Consumed by the handle_new_user() trigger to seed the profile row.
        data: { full_name: parsed.data.fullName, locale },
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (error) return fail(authErrorKey(error.code, error.status));

    // With email confirmation on, Supabase returns a user but no session.
    const needsConfirmation = Boolean(data.user) && !data.session;
    return ok({ needsConfirmation });
  });
}

export async function sendMagicLink(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("auth.magicLink", async () => {
    const parsed = parseInput(magicLinkSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const limited = await checkAuthRateLimit("auth.email", parsed.data.email);
    if (limited) return limited;

    const siteUrl = await resolveSiteUrl();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });

    if (error) return fail(authErrorKey(error.code, error.status));
    return ok();
  });
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("auth.requestPasswordReset", async () => {
    const parsed = parseInput(resetPasswordRequestSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    /*
     * Reporting the limit here does not reintroduce the enumeration oracle
     * below: the counter is keyed on the address as submitted, whether or not an
     * account exists, so a 429 says "you have asked too often", never "that
     * address is registered".
     */
    const limited = await checkAuthRateLimit("auth.email", parsed.data.email);
    if (limited) return limited;

    const siteUrl = await resolveSiteUrl();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    });

    // Rate limiting is worth reporting; anything else is swallowed on purpose.
    // "No account with that address" must look identical to success, or this
    // endpoint tells an attacker which addresses are registered.
    if (error && error.status === 429) return fail("rateLimited");
    return ok();
  });
}

export async function updatePassword(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("auth.updatePassword", async () => {
    const parsed = parseInput(updatePasswordSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("notAuthenticated");

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return fail(authErrorKey(error.code, error.status));
    return ok();
  });
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  // Drop the active-org hint too. Leaving it behind would point the next
  // person signing in on this machine at someone else's organization; RLS
  // rejects it, but the resulting redirect loop looks like a broken app.
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORG_COOKIE);

  redirect(LOGIN_PATH);
}

export async function redirectAfterLogin(): Promise<void> {
  redirect(AFTER_LOGIN_PATH);
}
