import type { Metadata } from "next";
import { KanbanIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pipeline");
  return { title: t("title") };
}

export default async function PipelinePage() {
  const t = await getTranslations("pipeline");

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="p-4 md:p-6">
        <EmptyState icon={KanbanIcon} title={t("emptyTitle")} body={t("emptyBody")} />
      </div>
    </>
  );
}
