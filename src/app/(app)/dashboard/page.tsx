import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import { LayoutDashboardIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingChecklistCard } from "@/features/dashboard/onboarding-checklist";
import { getDashboardSummary, isEmptyWorkspace } from "@/features/dashboard/queries";
import { SeedDemoButton } from "@/features/dashboard/seed-demo-button";
import { isAtLeastAdmin, requireSession } from "@/lib/auth/session";
import { centsToMajorUnit } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const session = await requireSession();

  /*
   * `getNow()` rather than `new Date()`.
   *
   * It is the same instant next-intl's formatter will use to render "last
   * updated", so the figures and the timestamp describe one moment. It is also
   * overridable in tests, which a bare clock read is not.
   */
  const now = await getNow();

  const summary = await getDashboardSummary(
    session.organization.id,
    session.organization.timezone,
    now,
    session.user.id,
  );

  if (!summary) {
    return (
      <>
        <PageHeader title={t("title")} />
        <div className="p-4 md:p-6">
          <EmptyState
            icon={LayoutDashboardIcon}
            title={t("unavailableTitle")}
            body={t("unavailableBody")}
          />
        </div>
      </>
    );
  }

  const money = (cents: number) =>
    format.number(centsToMajorUnit(cents), {
      style: "currency",
      currency: summary.currency,
      maximumFractionDigits: 0,
    });

  const stats = [
    {
      label: t("openDeals"),
      value: format.number(summary.openDeals),
      hint: t("acrossStages", { count: summary.stages.filter((s) => s.dealCount > 0).length }),
      href: "/pipeline",
    },
    {
      label: t("pipelineValue"),
      value: money(summary.pipelineCents),
      hint: t("openOnly"),
      href: "/pipeline",
    },
    {
      label: t("weightedValue"),
      value: money(summary.weightedCents),
      hint: t("weightedHint"),
      href: "/pipeline",
    },
    {
      label: t("overdueTasks"),
      value: format.number(summary.overdueTasks),
      hint:
        summary.overdueTasks > 0
          ? t("mineOverdue", { count: summary.myOverdueTasks })
          : t("dueToday", { count: summary.dueTodayTasks }),
      href: "/tasks",
      // The one figure that is bad news when it is high.
      emphasis: summary.overdueTasks > 0,
    },
  ];

  const secondary = [
    { label: t("wonThisMonth"), value: money(summary.wonThisMonthCents) },
    { label: t("wonCount"), value: format.number(summary.wonThisMonth) },
    { label: t("contacts"), value: format.number(summary.contacts) },
    { label: t("companies"), value: format.number(summary.companies) },
  ];

  const canSeed = isAtLeastAdmin(session.role) && isEmptyWorkspace(summary);
  const largestStage = Math.max(1, ...summary.stages.map((stage) => stage.totalCents));

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("subtitle", { organization: session.organization.name })}
        </p>

        {canSeed ? (
          <EmptyState
            icon={LayoutDashboardIcon}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <SeedDemoButton />
                <Button variant="outline" size="sm" render={<Link href="/contacts/import" />}>
                  {t("emptyImport")}
                </Button>
              </div>
            }
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="transition-colors hover:border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {/*
                   * The whole card is the link target, but only the label carries
                   * the anchor: wrapping a Card in an <a> nests interactive
                   * elements and breaks keyboard navigation.
                   */}
                  <Link href={stat.href} className="hover:text-foreground">
                    {stat.label}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={
                    stat.emphasis
                      ? "text-2xl font-semibold text-destructive tabular-nums"
                      : "text-2xl font-semibold tabular-nums"
                  }
                >
                  {stat.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-baseline justify-between gap-3 text-sm font-medium">
                <span>{t("byStage")}</span>
                <Link
                  href="/pipeline"
                  className="text-xs font-normal text-muted-foreground hover:text-foreground"
                >
                  {t("openBoard")}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.stages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noStages")}</p>
              ) : (
                <ul className="space-y-3">
                  {summary.stages.map((stage) => (
                    <li key={stage.id} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate">{stage.name}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {t("stageSummary", {
                            count: stage.dealCount,
                            value: money(stage.totalCents),
                          })}
                        </span>
                      </div>
                      {/*
                       * Bars are scaled against the largest stage, not the
                       * pipeline total: with six stages every bar would
                       * otherwise be a sliver and the comparison — which stage
                       * holds the money — would be unreadable.
                       */}
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width: `${Math.round((stage.totalCents / largestStage) * 100)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <OnboardingChecklistCard checklist={summary.checklist} />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t("thisMonth")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {secondary.map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs text-muted-foreground">{item.label}</dt>
                      <dd className="text-base font-medium tabular-nums">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("lastUpdated", {
            date: format.dateTime(now, { dateStyle: "long", timeStyle: "short" }),
          })}
        </p>
      </div>
    </>
  );
}
