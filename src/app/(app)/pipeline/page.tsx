import type { Metadata } from "next";
import Link from "next/link";
import { KanbanIcon, SettingsIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { ListSearch } from "@/components/list/list-search";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listCompanyOptions } from "@/features/companies/queries";
import { listContacts } from "@/features/contacts/queries";
import { NewDealDialog } from "@/features/deals/deal-dialog";
import { KanbanBoard } from "@/features/deals/kanban-board";
import { getBoard, getOrCreateDefaultPipeline, listStages } from "@/features/deals/queries";
import { getOrganizationMembers } from "@/features/organizations/queries";
import { requireSession } from "@/lib/auth/session";
import { centsToMajorUnit } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pipeline");
  return { title: t("title") };
}

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const t = await getTranslations("pipeline");
  const tContacts = await getTranslations("contacts");
  const format = await getFormatter();
  const locale = await getLocale();
  const session = await requireSession();

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : null;

  const pipelineId = await getOrCreateDefaultPipeline(session.organization.id, locale);

  if (!pipelineId) {
    return (
      <>
        <PageHeader title={t("title")} />
        <div className="p-4 md:p-6">
          <EmptyState icon={KanbanIcon} title={t("emptyTitle")} body={t("setupFailed")} />
        </div>
      </>
    );
  }

  const [board, stages, contactPage, companies, members] = await Promise.all([
    getBoard(pipelineId, { query }),
    listStages(session.organization.id, pipelineId),
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

  const contactOptions = contactPage.items.map((contact) => ({
    value: contact.id,
    label:
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      contact.email ||
      tContacts("unnamed"),
    companyId: contact.company?.id ?? null,
  }));
  const companyOptions = companies.map((company) => ({ value: company.id, label: company.name }));
  const memberOptions = members.map((member) => ({
    value: member.userId,
    label: member.fullName?.trim() || tContacts("unnamed"),
  }));

  const dialogProps = {
    pipelineId,
    stages,
    contacts: contactOptions,
    companies: companyOptions,
    members: memberOptions,
    currency: session.organization.currency,
  };

  // Board totals, summed from the per-stage aggregates the RPC already
  // computed over *every* open deal — not from the capped card lists.
  const openStages = (board?.stages ?? []).filter((stage) => !stage.is_won && !stage.is_lost);
  const totalCents = openStages.reduce((sum, stage) => sum + Number(stage.total_cents), 0);
  const weightedCents = openStages.reduce((sum, stage) => sum + Number(stage.weighted_cents), 0);
  const dealCount = openStages.reduce((sum, stage) => sum + Number(stage.deal_count), 0);

  const money = (cents: number) =>
    format.number(centsToMajorUnit(cents), {
      style: "currency",
      currency: session.organization.currency,
      maximumFractionDigits: 0,
    });

  const hasAnyDeal = (board?.stages ?? []).some((stage) => stage.deal_count > 0);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Button variant="ghost" size="sm" render={<Link href="/pipeline/stages" />}>
              <SettingsIcon className="size-4" />
              {t("manageStages")}
            </Button>
            <NewDealDialog {...dialogProps} />
          </>
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ListSearch placeholder={t("searchPlaceholder")} />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t("openDeals", { count: dealCount })}</span>
            <span>
              <span className="text-muted-foreground">{t("total")}</span>{" "}
              <span className="font-semibold tabular-nums">{money(totalCents)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">{t("weighted")}</span>{" "}
              <span className="font-semibold tabular-nums">{money(weightedCents)}</span>
            </span>
          </div>
        </div>

        {!board || !hasAnyDeal ? (
          <EmptyState
            icon={KanbanIcon}
            title={query ? t("noMatchesTitle") : t("emptyTitle")}
            body={query ? t("noMatchesBody") : t("emptyBody")}
            action={query ? undefined : <NewDealDialog {...dialogProps} />}
          />
        ) : (
          <KanbanBoard board={board} />
        )}
      </div>
    </>
  );
}
