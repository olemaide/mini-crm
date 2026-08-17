import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { isAtLeastAdmin, requireSession } from "@/lib/auth/session";
import { OrganizationForm } from "./organization-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("tabOrganization") };
}

export default async function OrganizationSettingsPage() {
  const t = await getTranslations("organization");
  const session = await requireSession();

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-medium">{t("settingsTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("settingsSubtitle")}</p>
      </div>

      <OrganizationForm
        organization={session.organization}
        canEdit={isAtLeastAdmin(session.role)}
      />
    </section>
  );
}
