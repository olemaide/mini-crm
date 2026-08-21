import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

/**
 * Shell for the four legal documents.
 *
 * Public and unauthenticated on purpose: a German Impressum has to be reachable
 * in at most two clicks from anywhere on the site, including from a page you are
 * not signed in to. That also means these routes must stay out of
 * PROTECTED_PREFIXES in proxy.ts.
 *
 * The cross-links at the bottom exist because a procurement reviewer opening the
 * Datenschutzerklärung is about to ask for the AV-Vertrag next.
 */
export default async function LegalLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("legal");
  const tCommon = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Link href="/" className="text-sm font-semibold hover:underline">
          {tCommon("appName")}
        </Link>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        {children}

        <nav className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-6 text-sm">
          <span className="text-muted-foreground">{t("sectionTitle")}</span>
          {LEGAL_DOCUMENTS.map((document) => (
            <Link
              key={document.slug}
              href={`/${document.slug}`}
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              {t(document.labelKey)}
            </Link>
          ))}
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            {t("backToApp")}
          </Link>
        </nav>
      </div>
    </main>
  );
}
