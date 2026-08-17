import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signInTitle") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getTranslations("auth");
  const params = await searchParams;

  // Only relative paths are honoured. Accepting an absolute URL here would
  // turn the login form into an open redirect.
  const rawNext = typeof params.next === "string" ? params.next : undefined;
  const nextPath = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : undefined;

  return (
    <AuthShell
      title={t("signInTitle")}
      subtitle={t("signInSubtitle")}
      footer={
        <div className="space-y-2">
          <p className="text-muted-foreground">
            {t("noAccount")}{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("signUpAction")}
            </Link>
          </p>
          <p>
            <Link
              href="/forgot-password"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </p>
        </div>
      }
    >
      <SignInForm nextPath={nextPath} />
    </AuthShell>
  );
}
