import "server-only";

import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting (build plan §9, Security).
 *
 * The counter lives in Postgres — see the phase9_rate_limits migration for why
 * that beats an in-memory counter on a serverless platform. This module owns two
 * things the database cannot: what the buckets are, and what happens when the
 * limiter itself is unavailable.
 */

export type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
};

/*
 * The rules, in one table so they can be read at a glance and argued about.
 *
 * Auth limits are per identifier, not per IP. Netlify puts every request behind
 * its own proxy, so `x-forwarded-for` is present but trivially spoofable and a
 * whole office shares one address — limiting by IP would either punish a team or
 * protect nobody. Limiting the *account* is what actually slows credential
 * stuffing against a specific user.
 *
 * Supabase Auth applies its own limits underneath all of this. These sit in
 * front so the attempt never reaches the auth server, and so the numbers are
 * ours to tune rather than a vendor's.
 */
export const RATE_LIMITS = {
  /** Password sign-in, per email address. Generous enough for a typo streak. */
  "auth.signIn": { limit: 10, windowSeconds: 300 },
  /** Account creation, per email address. */
  "auth.signUp": { limit: 5, windowSeconds: 3600 },
  /**
   * Anything that sends an email, per address. Low on purpose: this endpoint
   * turns a stranger's address into a mail we pay for and they did not ask for.
   */
  "auth.email": { limit: 3, windowSeconds: 3600 },
  /** Import chunks, per organization. A 5,000-row file is ten chunks. */
  "import.chunk": { limit: 240, windowSeconds: 300 },
  /** Starting an import run, per organization. */
  "import.start": { limit: 20, windowSeconds: 3600 },
  /** Global search, per user. Fires on keystrokes, so the ceiling is high. */
  "search.global": { limit: 120, windowSeconds: 60 },
  /** Webhook deliveries, per source. Polar retries; a storm is still a storm. */
  "webhook.polar": { limit: 300, windowSeconds: 60 },
  /** Whole-tenant export, per organization. Expensive and rarely legitimate in bulk. */
  "export.organization": { limit: 5, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Hashes the part of the bucket key that identifies a person.
 *
 * An email address in a `rate_limits` row would make an infrastructure table
 * into a register of who has tried to sign in — personal data, in a table the
 * DPA describes as holding none. A truncated SHA-256 keeps the counter unique
 * without keeping the address.
 */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * Counts one hit against a rule.
 *
 * **Fails open.** If the limiter cannot be reached, the request proceeds and the
 * failure is logged at error level. That is a deliberate trade: a limiter that
 * fails closed converts one broken database connection into a total outage —
 * nobody can sign in, including the person trying to fix it. Supabase Auth's own
 * limits remain underneath as a backstop for the paths that matter most.
 *
 * The service-role client is used because unauthenticated callers (sign-in,
 * password reset) have no JWT, and because `consume_rate_limit` is granted to
 * `service_role` alone — a signed-in user who could call it directly could burn
 * someone else's budget by guessing their bucket.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const allowed: RateLimitResult = {
    allowed: true,
    remaining: rule.limit,
    retryAfterSeconds: 0,
  };

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_bucket: `${name}:${identifier}`,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    if (error || !data) {
      logger.error({ err: error, rule: name }, "rate limiter unavailable; allowing the request");
      return allowed;
    }

    const result = data as unknown as {
      allowed: boolean;
      remaining: number;
      retryAfterSeconds: number;
    };

    if (!result.allowed) {
      // The bucket is hashed, so this line says which rule tripped without
      // recording who tripped it.
      logger.warn({ rule: name }, "rate limit exceeded");
    }

    return {
      allowed: result.allowed,
      remaining: result.remaining ?? 0,
      retryAfterSeconds: result.retryAfterSeconds ?? rule.windowSeconds,
    };
  } catch (error) {
    logger.error({ err: error, rule: name }, "rate limiter threw; allowing the request");
    return allowed;
  }
}

/** Convenience for the common case: limit by an email address, hashed. */
export function byEmail(email: string): string {
  return hashIdentifier(email);
}
