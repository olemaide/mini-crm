"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centsToMajorUnit } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createCheckout } from "./actions";
import type { BillingPlan } from "./queries";

type PlanCard = {
  id: "starter" | "pro";
  monthly: number;
  annual: number;
  features: string[];
};

export function PricingTable({
  plans,
  currentPlan,
  currency,
  canPay,
  configured,
}: {
  plans: PlanCard[];
  currentPlan: BillingPlan;
  currency: string;
  canPay: boolean;
  configured: boolean;
}) {
  const t = useTranslations("billing");
  const tError = useTranslations("errors.action");
  const format = useFormatter();
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [pending, setPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /*
   * Formatted per locale from integer cents, so a German customer sees
   * `19,00 €` and an English one `€19.00` — the same number, written the way
   * each expects. Never a hardcoded string.
   */
  const money = (cents: number) =>
    format.number(centsToMajorUnit(cents), { style: "currency", currency });

  function upgrade(plan: "starter" | "pro") {
    setPending(plan);
    startTransition(async () => {
      const result = await createCheckout({ plan, period });
      setPending(null);

      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      // A full navigation, not a router push: checkout is on Polar's domain.
      window.location.href = result.data.url;
    });
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-[3px]">
        {(["monthly", "annual"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={period === option}
            onClick={() => setPeriod(option)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              period === option
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`period_${option}`)}
            {option === "annual" ? (
              <span className="ml-1.5 text-xs text-primary">{t("annualSaving")}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const cents = period === "monthly" ? plan.monthly : plan.annual;

          return (
            <Card key={plan.id} className={cn(isCurrent && "border-primary")}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t(`plan_${plan.id}`)}</CardTitle>
                  {isCurrent ? <Badge>{t("currentPlan")}</Badge> : null}
                </div>
                <p className="mt-1">
                  <span className="text-2xl font-semibold tabular-nums">{money(cents)}</span>
                  <span className="text-sm text-muted-foreground"> {t(`perSeat_${period}`)}</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={plan.id === "pro" ? "default" : "outline"}
                  disabled={!configured || !canPay || isCurrent || pending !== null}
                  onClick={() => upgrade(plan.id)}
                >
                  {isCurrent
                    ? t("currentPlan")
                    : pending === plan.id
                      ? t("redirecting")
                      : t("choosePlan")}
                </Button>

                {!canPay ? <p className="text-xs text-muted-foreground">{t("adminOnly")}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
