import Link from "next/link";
import { ActivityIcon, ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LegalLinks } from "@/components/legal-links";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Public landing page.
 *
 * Still a single screen rather than the full marketing site — hero, screenshots,
 * pricing and FAQ are the remaining Phase 9 launch item. What it does carry now
 * is the legal footer, which §5 DDG makes non-optional before the first visitor.
 *
 * When the marketing pages land they move into a locale-prefixed
 * `[locale]/(marketing)` group for SEO; app routes stay unprefixed and
 * cookie-driven.
 */
export default async function HomePage() {
  const t = await getTranslations("home");
  const tCommon = await getTranslations("common");
  const tAuth = await getTranslations("auth");
  const user = await getCurrentUser();

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">{tCommon("appName")}</span>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          {user ? null : (
            <Button variant="ghost" size="sm" render={<Link href="/login" />}>
              {tAuth("signInAction")}
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-20">
        <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {t("eyebrow")}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t("heading")}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">{t("body")}</p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button render={<Link href={user ? "/dashboard" : "/signup"} />}>
            {user ? t("openApp") : tAuth("signUpAction")}
            <ArrowRightIcon className="size-4" />
          </Button>
          <Button variant="outline" render={<Link href="/api/health" />}>
            <ActivityIcon className="size-4" />
            {t("healthCheck")}
          </Button>
        </div>
      </div>

      <footer className="border-t px-4 py-6">
        <LegalLinks />
      </footer>
    </main>
  );
}
