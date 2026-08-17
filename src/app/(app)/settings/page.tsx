import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireSession } from "@/lib/auth/session";
import { defaultLocale, isLocale } from "@/i18n/config";
import { ProfileForm } from "./profile-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("tabProfile") };
}

export default async function ProfileSettingsPage() {
  const t = await getTranslations("settings");
  const session = await requireSession();

  const locale = isLocale(session.profile?.locale) ? session.profile.locale : defaultLocale;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-medium">{t("profileTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("profileSubtitle")}</p>
      </div>

      <ProfileForm
        fullName={session.profile?.fullName ?? null}
        email={session.user.email ?? ""}
        locale={locale}
      />
    </section>
  );
}
