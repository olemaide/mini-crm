import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ImportHistory } from "@/features/import/import-history";
import { ImportWizard } from "@/features/import/import-wizard";
import { listImportJobs } from "@/features/import/queries";
import { requireSession } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("import");
  return { title: t("title") };
}

export default async function ImportPage() {
  const t = await getTranslations("import");
  const session = await requireSession();
  const jobs = await listImportJobs(session.organization.id);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Button variant="ghost" size="sm" render={<Link href="/contacts" />}>
            <ArrowLeftIcon className="size-4" />
            {t("backToContacts")}
          </Button>
        }
      />

      <div className="flex flex-col gap-8 p-4 md:p-6">
        <ImportWizard />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("historyTitle")}</h2>
          <ImportHistory jobs={jobs} />
        </section>
      </div>
    </>
  );
}
