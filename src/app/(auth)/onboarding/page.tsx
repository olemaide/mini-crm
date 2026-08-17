import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { AFTER_LOGIN_PATH } from "@/lib/auth/constants";
import { getMemberships, requireUser } from "@/lib/auth/session";
import { CreateOrganizationForm } from "./create-organization-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage() {
  const t = await getTranslations("onboarding");
  const user = await requireUser();

  // Already in an organization — nothing to onboard. Guards against a stale
  // bookmark and against the (app) layout bouncing back and forth.
  const memberships = await getMemberships();
  if (memberships.length > 0) redirect(AFTER_LOGIN_PATH);

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <div className="space-y-2 text-muted-foreground">
          <p>{t("signedInAs", { email: user.email ?? "" })}</p>
          <SignOutButton />
        </div>
      }
    >
      <CreateOrganizationForm />
    </AuthShell>
  );
}
