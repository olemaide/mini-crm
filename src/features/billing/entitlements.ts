import "server-only";

import { fail, type ActionResult } from "@/lib/actions";
import { getBillingState } from "./queries";

export type Entitlement = "write" | "unlimited_contacts" | "multiple_pipelines";

/**
 * The server-side entitlement gate for Server Actions.
 *
 * This is the *convenience* layer, not the security boundary. Anyone signed in
 * can issue PostgREST requests directly, so anything that genuinely protects
 * revenue is also enforced by a database trigger — `enforce_contact_limit()`
 * and `enforce_write_access()`. What this buys is a clear, translated error at
 * the point of action instead of a raw constraint violation.
 *
 * Returns null when allowed, so call sites read:
 *
 *   const denied = await requireEntitlement(orgId, "write");
 *   if (denied) return denied;
 */
export async function requireEntitlement(
  organizationId: string,
  entitlement: Entitlement,
): Promise<ActionResult<never> | null> {
  const state = await getBillingState(organizationId);
  // No row at all: fail closed. An organization without a subscription is a
  // bug, and guessing in the customer's favour is how you give away the product.
  if (!state) return fail("subscriptionInactive");

  if (!state.hasWriteAccess) return fail("subscriptionInactive");

  switch (entitlement) {
    case "unlimited_contacts":
      if (state.contactLimit !== null && state.contactCount >= state.contactLimit) {
        return fail("contactLimitReached");
      }
      return null;
    case "multiple_pipelines":
      return state.plan === "pro" ? null : fail("planUpgradeRequired");
    default:
      return null;
  }
}
