import { env } from "@/env";

/**
 * The plan catalogue.
 *
 * Prices are duplicated here purely so the in-app pricing table can render
 * without a round trip to Polar on every page load. Polar remains the authority
 * on what is actually charged — if the two ever disagree, the customer is
 * charged Polar's number, and this table is the one that is wrong.
 *
 * Amounts are integer cents (convention 1) and formatted per locale at render.
 */
export type PlanId = "starter" | "pro";
export type BillingPeriod = "monthly" | "annual";

export type PlanDefinition = {
  id: PlanId;
  /** Cents per seat, per period. */
  price: Record<BillingPeriod, number>;
  productId: Record<BillingPeriod, string | undefined>;
  contactLimit: number | null;
  pipelineLimit: number;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    price: { monthly: 1900, annual: 19_000 },
    productId: {
      monthly: env.POLAR_PRODUCT_STARTER_MONTHLY,
      annual: env.POLAR_PRODUCT_STARTER_ANNUAL,
    },
    contactLimit: 2500,
    pipelineLimit: 1,
  },
  pro: {
    id: "pro",
    price: { monthly: 3900, annual: 39_000 },
    productId: {
      monthly: env.POLAR_PRODUCT_PRO_MONTHLY,
      annual: env.POLAR_PRODUCT_PRO_ANNUAL,
    },
    contactLimit: null,
    pipelineLimit: 5,
  },
};

export const PLAN_IDS = ["starter", "pro"] as const;

/** Annual is twelve months for the price of ten — stated, not recomputed. */
export const ANNUAL_MONTHS_FREE = 2;

export function productIdFor(plan: PlanId, period: BillingPeriod): string | undefined {
  return PLANS[plan].productId[period];
}

/**
 * Maps a Polar product id back to a plan.
 *
 * The webhook needs this: it is told a product id and has to decide what the
 * organization is now entitled to. Driven by the same env configuration as
 * checkout, so the two cannot disagree about which product means "pro".
 */
export function planForProductId(productId: string | null | undefined): PlanId | null {
  if (!productId) return null;
  for (const plan of PLAN_IDS) {
    const ids = PLANS[plan].productId;
    if (ids.monthly === productId || ids.annual === productId) return plan;
  }
  return null;
}

export function isBillingConfigured(): boolean {
  return Boolean(
    env.POLAR_ACCESS_TOKEN &&
    env.POLAR_ORGANIZATION_ID &&
    env.POLAR_PRODUCT_STARTER_MONTHLY &&
    env.POLAR_PRODUCT_PRO_MONTHLY,
  );
}
