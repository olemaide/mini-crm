import type { Metadata } from "next";
import { SquareCheckIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("title") };
}

export default async function TasksPage() {
  const t = await getTranslations("tasks");

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="p-4 md:p-6">
        <EmptyState icon={SquareCheckIcon} title={t("emptyTitle")} body={t("emptyBody")} />
      </div>
    </>
  );
}
