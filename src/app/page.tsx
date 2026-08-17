import Link from "next/link";
import { ArrowRightIcon, ActivityIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";

/**
 * Public landing page.
 *
 * A placeholder for the marketing site built in Phase 9. When those pages land
 * they move into a locale-prefixed `[locale]/(marketing)` group for SEO; app
 * routes stay unprefixed and cookie-driven.
 */
export default async function HomePage() {
  const t = await getTranslations("home");
  const tCommon = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">{tCommon("appName")}</span>
        <LocaleSwitcher />
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
          <Button render={<Link href="/dashboard" />}>
            {t("openApp")}
            <ArrowRightIcon className="size-4" />
          </Button>
          <Button variant="outline" render={<Link href="/api/health" />}>
            <ActivityIcon className="size-4" />
            {t("healthCheck")}
          </Button>
        </div>
      </div>
    </main>
  );
}
