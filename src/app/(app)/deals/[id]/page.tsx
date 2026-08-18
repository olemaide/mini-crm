import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getNow, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCompanyOptions } from "@/features/companies/queries";
import { listContacts } from "@/features/contacts/queries";
import { DealDetailActions } from "@/features/deals/deal-dialog";
import { getDeal, listStages } from "@/features/deals/queries";
import { getOrganizationMembers } from "@/features/organizations/queries";
import { requireSession } from "@/lib/auth/session";
import { centsToMajorUnit } from "@/lib/money";

export async function generateMetadata({ params }: PageProps<"/deals/[id]">): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const deal = await getDeal(session.organization.id, id);
  return deal ? { title: deal.title } : {};
}

export default async function DealDetailPage({ params }: PageProps<"/deals/[id]">) {
  const t = await getTranslations("pipeline");
  const tContacts = await getTranslations("contacts");
  const format = await getFormatter();
  const session = await requireSession();
  const { id } = await params;

  const deal = await getDeal(session.organization.id, id);
  if (!deal) notFound();

  const [stages, contactPage, companies, members] = await Promise.all([
    listStages(session.organization.id, deal.pipelineId),
    listContacts({
      organizationId: session.organization.id,
      page: 1,
      pageSize: 500,
      sort: "name",
      direction: "asc",
    }),
    listCompanyOptions(session.organization.id),
    getOrganizationMembers(session.organization.id),
  ]);

  const money = (cents: number) =>
    format.number(centsToMajorUnit(cents), { style: "currency", currency: deal.currency });

  // Stable per-request timestamp; see the note in kanban-board.tsx.
  const now = await getNow();
  const daysInStage = Math.floor(
    (now.getTime() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000,
  );

  const weightedCents = Math.round((deal.valueCents * (deal.stage?.probability ?? 0)) / 100);

  return (
    <>
      <PageHeader
        title={deal.title}
        actions={
          <DealDetailActions
            deal={deal}
            pipelineId={deal.pipelineId}
            stages={stages}
            contacts={contactPage.items.map((contact) => ({
              value: contact.id,
              label:
                [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
                contact.email ||
                tContacts("unnamed"),
              companyId: contact.company?.id ?? null,
            }))}
            companies={companies.map((company) => ({ value: company.id, label: company.name }))}
            members={members.map((member) => ({
              value: member.userId,
              label: member.fullName?.trim() || tContacts("unnamed"),
            }))}
            currency={session.organization.currency}
          />
        }
      />

      <div className="grid gap-6 p-4 md:p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    deal.status === "won"
                      ? "default"
                      : deal.status === "lost"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {t(`status_${deal.status}`)}
                </Badge>
                {deal.stage ? <Badge variant="outline">{deal.stage.name}</Badge> : null}
                {deal.status === "open" ? (
                  <span className="text-xs text-muted-foreground">
                    {t("daysInStageLong", { days: daysInStage })}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {t("value")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {money(deal.valueCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {t("weighted")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{money(weightedCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("atProbability", { percent: deal.stage?.probability ?? 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {t("expectedClose")}
                  </p>
                  <p className="mt-1 text-sm">
                    {deal.expectedCloseDate
                      ? format.dateTime(new Date(deal.expectedCloseDate), { dateStyle: "long" })
                      : "—"}
                  </p>
                </div>
              </div>

              <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    {t("contact")}
                  </dt>
                  <dd className="mt-1 text-sm">
                    {deal.contact ? (
                      <Link
                        href={`/contacts/${deal.contact.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {deal.contact.name || tContacts("unnamed")}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    {t("company")}
                  </dt>
                  <dd className="mt-1 text-sm">
                    {deal.company ? (
                      <Link
                        href={`/companies/${deal.company.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {deal.company.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    {t("owner")}
                  </dt>
                  <dd className="mt-1 text-sm">
                    {deal.owner?.name ?? <span className="text-muted-foreground">—</span>}
                  </dd>
                </div>
                {deal.status === "lost" ? (
                  <div>
                    <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                      {t("lostReasonLabel")}
                    </dt>
                    <dd className="mt-1 text-sm">
                      {deal.lostReason ?? <span className="text-muted-foreground">—</span>}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          {/* Placeholders so the page shape is settled before Phases 5 and 6. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tContacts("feedTitle")}</CardTitle>
              <CardDescription>{tContacts("feedComingSoon")}</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tContacts("meta")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{tContacts("created")}</p>
                <p>{format.dateTime(new Date(deal.createdAt), { dateStyle: "long" })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("stageEntered")}</p>
                <p>
                  {format.dateTime(new Date(deal.stageEnteredAt), {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              {deal.closedAt ? (
                <div>
                  <p className="text-xs text-muted-foreground">{t("closedAt")}</p>
                  <p>{format.dateTime(new Date(deal.closedAt), { dateStyle: "long" })}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tContacts("tasksTitle")}</CardTitle>
              <CardDescription>{tContacts("tasksComingSoon")}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </>
  );
}
