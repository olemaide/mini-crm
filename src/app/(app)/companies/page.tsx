import type { Metadata } from "next";
import { Building2Icon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("companies");
  return { title: t("title") };
}

export default async function CompaniesPage() {
  const t = await getTranslations("companies");

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="p-4 md:p-6">
        <EmptyState icon={Building2Icon} title={t("emptyTitle")} body={t("emptyBody")} />
      </div>
    </>
  );
}
