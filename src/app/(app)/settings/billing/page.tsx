import type { Metadata } from "next";
import { getFormatter, getNow, getTranslations } from "next-intl/server";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getBillingState, trialDaysLeft } from "@/features/billing/queries";
import { PortalButton } from "@/features/billing/portal-button";
import { PricingTable } from "@/features/billing/pricing-table";
import { isBillingConfigured, PLANS } from "@/lib/polar/plans";
import { isAtLeastAdmin, requireSession } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("tabBilling") };
}

export default async function BillingSettingsPage() {
  const t = await getTranslations("billing");
  const format = await getFormatter();
  const session = await requireSession();
  const now = await getNow();

  const state = await getBillingState(session.organization.id);
  const configured = isBillingConfigured();
  const canPay = isAtLeastAdmin(session.role);

  if (!state) {
    return (
      <section className="space-y-5">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("noSubscriptionRow")}</p>
      </section>
    );
  }

  const daysLeft = trialDaysLeft(state, now);
  const onTrial = state.plan === "trial";

  const plans = [
    {
      id: "starter" as const,
      monthly: PLANS.starter.price.monthly,
      annual: PLANS.starter.price.annual,
      features: [
        t("feature_contacts", { count: PLANS.starter.contactLimit ?? 0 }),
        t("feature_pipelines", { count: PLANS.starter.pipelineLimit }),
        t("feature_core"),
      ],
    },
    {
      id: "pro" as const,
      monthly: PLANS.pro.price.monthly,
      annual: PLANS.pro.price.annual,
      features: [
        t("feature_contactsUnlimited"),
        t("feature_pipelines", { count: PLANS.pro.pipelineLimit }),
        t("feature_automations"),
      ],
    },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* The state that costs money to get wrong gets the loudest treatment. */}
      {!state.hasWriteAccess ? (
        <Alert variant="destructive">
          <AlertTitle>{t("lockedTitle")}</AlertTitle>
          <AlertDescription>{t("lockedBody")}</AlertDescription>
        </Alert>
      ) : onTrial ? (
        <Alert>
          <AlertTitle>{t("trialTitle", { days: daysLeft })}</AlertTitle>
          <AlertDescription>{t("trialBody")}</AlertDescription>
        </Alert>
      ) : state.plan === "past_due" ? (
        <Alert variant="destructive">
          <AlertTitle>{t("pastDueTitle")}</AlertTitle>
          <AlertDescription>{t("pastDueBody")}</AlertDescription>
        </Alert>
      ) : state.cancelAtPeriodEnd && state.currentPeriodEnd ? (
        <Alert>
          <AlertTitle>{t("cancellingTitle")}</AlertTitle>
          <AlertDescription>
            {t("cancellingBody", {
              date: format.dateTime(new Date(state.currentPeriodEnd), { dateStyle: "long" }),
            })}
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">{t("plan")}</dt>
          <dd className="mt-1">
            <Badge variant={state.plan === "pro" ? "default" : "secondary"}>
              {t(`plan_${state.plan}`)}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">{t("seats")}</dt>
          {/* Seats billed vs people in the team — a mismatch is worth seeing. */}
          <dd className="mt-1 text-sm tabular-nums">
            {t("seatsValue", { seats: state.seats, members: state.members })}
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("contactsUsed")}
          </dt>
          <dd className="mt-1 text-sm tabular-nums">
            {state.contactLimit === null
              ? t("contactsUnlimited", { count: state.contactCount })
              : t("contactsOfLimit", { count: state.contactCount, limit: state.contactLimit })}
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {onTrial ? t("trialEnds") : t("renews")}
          </dt>
          <dd className="mt-1 text-sm">
            {(() => {
              const date = onTrial ? state.trialEndsAt : state.currentPeriodEnd;
              return date ? format.dateTime(new Date(date), { dateStyle: "long" }) : "—";
            })()}
          </dd>
        </div>
      </dl>

      {!configured ? (
        <Alert>
          <AlertTitle>{t("notConfiguredTitle")}</AlertTitle>
          <AlertDescription>{t("notConfiguredBody")}</AlertDescription>
        </Alert>
      ) : null}

      <PricingTable
        plans={plans}
        currentPlan={state.plan}
        currency={session.organization.currency}
        canPay={canPay}
        configured={configured}
      />

      {state.polarCustomerId ? (
        <div className="flex items-center gap-3 border-t pt-4">
          <PortalButton disabled={!canPay} />
          <p className="text-sm text-muted-foreground">{t("portalHint")}</p>
        </div>
      ) : null}
    </section>
  );
}
