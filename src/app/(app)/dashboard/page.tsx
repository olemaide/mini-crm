import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centsToMajorUnit } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

/*
 * Fixed sample figures. Real aggregates arrive with the pipeline in Phase 4 as a
 * Postgres view — computed in SQL, not summed in JS over a paginated array.
 *
 * The date is a constant rather than `new Date()` so the render is deterministic
 * and cannot produce a server/client hydration mismatch.
 */
const SAMPLE = {
  openDeals: 12,
  pipelineValueCents: 18_450_000,
  weightedValueCents: 7_312_500,
  overdueTasks: 3,
  lastUpdated: new Date("2026-08-17T09:00:00Z"),
  currency: "EUR",
} as const;

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  const money = (cents: number) =>
    format.number(centsToMajorUnit(cents), {
      style: "currency",
      currency: SAMPLE.currency,
      maximumFractionDigits: 0,
    });

  const stats = [
    { label: t("openDeals"), value: format.number(SAMPLE.openDeals) },
    { label: t("pipelineValue"), value: money(SAMPLE.pipelineValueCents) },
    { label: t("weightedValue"), value: money(SAMPLE.weightedValueCents) },
    {
      label: t("overdueTasks"),
      value: format.number(SAMPLE.overdueTasks),
      hint: t("overdueCount", { count: SAMPLE.overdueTasks }),
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">{stat.value}</div>
                {stat.hint ? (
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{t("sampleNotice")}</p>
          <p>
            {t("lastUpdated", {
              date: format.dateTime(SAMPLE.lastUpdated, { dateStyle: "long", timeStyle: "short" }),
            })}
          </p>
        </div>
      </div>
    </>
  );
}
