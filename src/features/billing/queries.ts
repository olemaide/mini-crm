import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type BillingPlan = Database["public"]["Enums"]["billing_plan"];

export type BillingState = {
  plan: BillingPlan;
  status: string;
  seats: number;
  members: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasWriteAccess: boolean;
  /** null means unlimited. */
  contactLimit: number | null;
  contactCount: number;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
};

/**
 * The organization's billing state, computed fresh on every read.
 *
 * Never cached: a trial that expired thirty seconds ago has expired, and the
 * whole point of deriving entitlements rather than storing them is that they
 * cannot go stale.
 */
export async function getBillingState(organizationId: string): Promise<BillingState | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("billing_state", {
    p_organization_id: organizationId,
  });

  if (error || !data) return null;
  return data as unknown as BillingState;
}

/** Days remaining on the trial, rounded up; 0 once it has passed. */
export function trialDaysLeft(state: BillingState, now: Date): number {
  if (!state.trialEndsAt) return 0;
  const ms = new Date(state.trialEndsAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
