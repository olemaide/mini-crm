import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const t = await getTranslations("settings");

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <SettingsTabs
          labels={{
            profile: t("tabProfile"),
            organization: t("tabOrganization"),
            members: t("tabMembers"),
          }}
        />
        {children}
      </div>
    </>
  );
}
