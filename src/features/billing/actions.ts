"use server";

import { z } from "zod";

import { env } from "@/env";
import { fail, ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getSession, isAtLeastAdmin } from "@/lib/auth/session";
import { createPolarClient } from "@/lib/polar/client";
import { productIdFor } from "@/lib/polar/plans";
import { getBillingState } from "./queries";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro"]),
  period: z.enum(["monthly", "annual"]),
});

/**
 * Starts a Polar checkout and returns the URL to send the browser to.
 *
 * `metadata.organization_id` is the whole hinge of the integration: it is the
 * only thing that lets the webhook decide which tenant a subscription belongs
 * to. Without it a payment arrives with nowhere to apply it.
 */
export async function createCheckout(input: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction("billing.checkout", async ({ log }) => {
    const parsed = parseInput(checkoutSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");
    // Paying is an owner/admin decision, not something any member can trigger.
    if (!isAtLeastAdmin(session.role)) return fail("notAuthorized");

    const polar = createPolarClient();
    const productId = productIdFor(parsed.data.plan, parsed.data.period);
    if (!polar || !productId) return fail("billingNotConfigured");

    // Seats follow the team. Polar is told the count at checkout; keeping it in
    // step afterwards is the job of the member-change sync.
    const seats = await memberCount(session.organization.id);

    try {
      const checkout = await polar.checkouts.create({
        products: [productId],
        seats,
        customerEmail: session.user.email ?? undefined,
        successUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=success`,
        // The only link back to the tenant. The webhook reads this and nothing
        // else to decide which organization just paid.
        metadata: { organization_id: session.organization.id },
      });

      return ok({ url: checkout.url });
    } catch (error) {
      log.error({ err: error }, "polar checkout failed");
      return fail("billingUnavailable");
    }
  });
}

/**
 * A link into Polar's customer portal for invoices, card changes and
 * cancellation.
 *
 * Deliberately not reimplemented in-app: invoices are Polar's job as merchant
 * of record, and a self-built cancellation flow is a second source of truth for
 * subscription state.
 */
export async function createPortalSession(): Promise<ActionResult<{ url: string }>> {
  return runAction("billing.portal", async ({ log }) => {
    const session = await getSession();
    if (!session) return fail("notAuthenticated");
    if (!isAtLeastAdmin(session.role)) return fail("notAuthorized");

    const polar = createPolarClient();
    if (!polar) return fail("billingNotConfigured");

    const state = await getBillingState(session.organization.id);
    if (!state?.polarCustomerId) return fail("noSubscription");

    try {
      const portal = await polar.customerSessions.create({
        customerId: state.polarCustomerId,
      });
      return ok({ url: portal.customerPortalUrl });
    } catch (error) {
      log.error({ err: error }, "polar portal session failed");
      return fail("billingUnavailable");
    }
  });
}

async function memberCount(organizationId: string): Promise<number> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  return Math.max(count ?? 1, 1);
}
