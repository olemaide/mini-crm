import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

import { env } from "@/env";
import { createRequestLogger } from "@/lib/logger";
import { planForProductId } from "@/lib/polar/plans";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * Polar webhooks.
 *
 * Node.js runtime, not edge: signature verification needs the raw body bytes
 * and `node:crypto`. Next 16 defaults route handlers to Node, but stating it
 * makes the requirement visible to whoever moves this file next.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BillingPlan = Database["public"]["Enums"]["billing_plan"];

/** Polar's subscription status → the plan the app enforces. */
function planForStatus(status: string, productPlan: BillingPlan | null): BillingPlan {
  switch (status) {
    case "active":
    case "trialing":
      return productPlan ?? "starter";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "revoked":
    case "incomplete_expired":
      return "canceled";
    default:
      // An unknown status must not silently grant access. Treating it as
      // canceled keeps the data readable while withholding writes.
      return "canceled";
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/*
 * Reads a field under either casing.
 *
 * This is load-bearing, and it is not paranoia. The SDK's zod schemas rename
 * Polar's snake_case wire format to camelCase — but only when parsing succeeds.
 * The fallback above deliberately continues on the *raw* body when the schema
 * does not match, and the raw body is snake_case.
 *
 * Reading only camelCase there silently produced nulls: a verified event set
 * `polar_customer_id` and `current_period_end` to null, which loses the
 * customer's portal link and makes a later cancellation revoke access
 * immediately instead of at the end of the paid period. Both casings, always.
 */
function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

export async function POST(request: Request) {
  const { log, requestId } = createRequestLogger({ action: "webhooks.polar" });

  if (!env.POLAR_WEBHOOK_SECRET) {
    log.error({}, "polar webhook received but no secret is configured");
    return Response.json({ error: "not configured" }, { status: 500 });
  }

  /*
   * Ahead of signature verification, deliberately.
   *
   * Verification is HMAC over the whole body plus a database write; letting
   * anyone on the internet trigger that at will is the flood worth stopping,
   * and by definition an attacker's requests are the ones that fail the
   * signature check. The cost is that a flood can push genuine deliveries into
   * 429 — which is why 429 is the answer rather than 403: Polar treats any
   * non-2xx as retryable and redelivers, so a real event is delayed, not lost.
   */
  const limit = await consumeRateLimit("webhook.polar", "endpoint");
  if (!limit.allowed) {
    return Response.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  /*
   * The raw body, before any parsing.
   *
   * `request.json()` would consume the stream and re-serialise, and the
   * signature is over the exact bytes Polar sent — a re-encoded body verifies
   * differently.
   */
  const body = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  /*
   * Two failures, deliberately treated very differently.
   *
   * `validateEvent` does both signature verification and schema parsing. A bad
   * signature is a rejected message — 403, and Polar should not retry.
   *
   * A *schema* failure is not. It means the signature was good, so the payload
   * genuinely came from Polar, and only our copy of their model is out of date.
   * Dropping a real subscription change because they added a field would be a
   * silent revenue bug, so the raw JSON is used instead and the mismatch is
   * logged loudly. Only the fields read below actually matter here.
   */
  let event: { type: string; data: unknown };
  try {
    event = validateEvent(body, headers, env.POLAR_WEBHOOK_SECRET) as typeof event;
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      log.warn({}, "polar webhook signature rejected");
      return Response.json({ error: "invalid signature" }, { status: 403 });
    }

    try {
      const raw = JSON.parse(body) as { type?: unknown; data?: unknown };
      if (typeof raw.type !== "string" || typeof raw.data !== "object" || raw.data === null) {
        throw new Error("unrecognisable payload");
      }
      log.warn(
        { err: error, type: raw.type },
        "polar payload did not match the SDK model; continuing on the verified raw body",
      );
      event = { type: raw.type, data: raw.data };
    } catch (parseError) {
      log.error({ err: parseError }, "polar webhook body is not usable");
      return Response.json({ error: "bad request" }, { status: 400 });
    }
  }

  const payload = event.data as Record<string, unknown>;
  const eventId = asString(headers["webhook-id"]) ?? asString(payload.id);

  if (!eventId) {
    log.warn({ type: event.type }, "polar webhook has no id to deduplicate on");
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const organizationId = asString(metadata.organization_id);

  /*
   * Idempotency, claimed before any work is done.
   *
   * `billing_events.id` is Polar's event id, so a replay collides on the
   * primary key and this returns 200 without touching the subscription. Polar
   * retries on any non-2xx and delivers at least once, so a handler that is not
   * idempotent double-grants entitlements.
   *
   * Inserting *first* rather than checking-then-inserting also closes the race
   * between two concurrent deliveries of the same event.
   */
  const { error: claimError } = await supabase.from("billing_events").insert({
    id: eventId,
    type: event.type,
    payload: JSON.parse(
      body,
    ) as Database["public"]["Tables"]["billing_events"]["Insert"]["payload"],
    organization_id: organizationId,
  });

  if (claimError) {
    if (claimError.code === "23505") {
      log.info({ eventId, type: event.type }, "polar webhook already processed, ignoring replay");
      return Response.json({ ok: true, duplicate: true });
    }
    log.error({ err: claimError, eventId }, "could not record polar webhook");
    // 500 so Polar retries — the event has not been handled.
    return Response.json({ error: "storage failed", requestId }, { status: 500 });
  }

  // Orders carry no subscription state worth mirroring; recording the event is
  // the whole job, and the audit row above already did it.
  if (!event.type.startsWith("subscription.")) {
    return Response.json({ ok: true });
  }

  if (!organizationId) {
    // Every checkout this app creates sets metadata.organization_id. A
    // subscription without one was created elsewhere — in the Polar dashboard,
    // say — and there is no tenant to apply it to.
    log.warn({ eventId, type: event.type }, "subscription event without organization_id metadata");
    return Response.json({ ok: true, unlinked: true });
  }

  const product = (payload.product ?? {}) as Record<string, unknown>;
  const productId = asString(pick(payload, "productId", "product_id")) ?? asString(product.id);
  const status = asString(payload.status) ?? "unknown";
  const plan = planForStatus(status, planForProductId(productId));

  const seatsRaw = pick(payload, "seats", "quantity");
  const seats = typeof seatsRaw === "number" && seatsRaw > 0 ? Math.floor(seatsRaw) : 1;

  const { error: upsertError } = await supabase.from("subscriptions").upsert(
    {
      organization_id: organizationId,
      polar_customer_id: asString(pick(payload, "customerId", "customer_id")),
      polar_subscription_id: asString(payload.id),
      product_id: productId,
      plan,
      status,
      seats,
      current_period_end: asDate(pick(payload, "currentPeriodEnd", "current_period_end")),
      cancel_at_period_end: pick(payload, "cancelAtPeriodEnd", "cancel_at_period_end") === true,
    },
    { onConflict: "organization_id" },
  );

  if (upsertError) {
    log.error({ err: upsertError, eventId, organizationId }, "subscription upsert failed");
    /*
     * 500 so Polar retries — but the audit row is already committed, so the
     * retry would be swallowed as a duplicate. Delete the claim so the retry
     * can do real work.
     */
    await supabase.from("billing_events").delete().eq("id", eventId);
    return Response.json({ error: "update failed", requestId }, { status: 500 });
  }

  log.info({ eventId, type: event.type, organizationId, plan, status }, "subscription updated");
  return Response.json({ ok: true });
}
