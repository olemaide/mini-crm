import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

/**
 * Footer links to the four legal documents.
 *
 * Present on the landing page and on every unauthenticated screen, because §5
 * DDG wants the Impressum reachable "easily recognisable, directly accessible
 * and permanently available" — which German case law reads as at most two clicks
 * from anywhere, including from the sign-up form.
 */
export async function LegalLinks({ className }: { className?: string }) {
  const t = await getTranslations("legal");

  return (
    <nav
      className={
        className ??
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      }
    >
      {LEGAL_DOCUMENTS.map((document) => (
        <Link key={document.slug} href={`/${document.slug}`} className="hover:text-foreground">
          {t(document.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
