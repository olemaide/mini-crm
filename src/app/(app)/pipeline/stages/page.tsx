import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getOrCreateDefaultPipeline, listStages } from "@/features/deals/queries";
import { StageManager } from "@/features/deals/stage-manager";
import { requireSession } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pipeline");
  return { title: t("manageStages") };
}

export default async function StagesPage() {
  const t = await getTranslations("pipeline");
  const locale = await getLocale();
  const session = await requireSession();

  const pipelineId = await getOrCreateDefaultPipeline(session.organization.id, locale);
  if (!pipelineId) notFound();

  const stages = await listStages(session.organization.id, pipelineId);

  return (
    <>
      <PageHeader
        title={t("manageStages")}
        actions={
          <Button variant="ghost" size="sm" render={<Link href="/pipeline" />}>
            <ArrowLeftIcon className="size-4" />
            {t("backToBoard")}
          </Button>
        }
      />

      <div className="flex flex-col gap-5 p-4 md:p-6">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("stagesIntro")}</p>
        <StageManager pipelineId={pipelineId} stages={stages} />
      </div>
    </>
  );
}
