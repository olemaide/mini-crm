import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getAutomationSettings } from "@/features/tasks/queries";
import { isAtLeastAdmin, requireSession } from "@/lib/auth/session";
import { AutomationForm } from "./automation-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("tabAutomation") };
}

export default async function AutomationSettingsPage() {
  const t = await getTranslations("automation");
  const session = await requireSession();

  const settings = await getAutomationSettings(session.organization.id);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-medium">{t("settingsTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("settingsSubtitle")}</p>
      </div>

      {settings ? (
        <AutomationForm settings={settings} canEdit={isAtLeastAdmin(session.role)} />
      ) : (
        // Every organization gets a settings row at creation, so this is only
        // reachable if one was deleted by hand. Automation is off in that
        // state, which is what the message says.
        <p className="text-sm text-muted-foreground">{t("missing")}</p>
      )}
    </section>
  );
}
