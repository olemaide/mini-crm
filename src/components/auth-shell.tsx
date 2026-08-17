import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";

/**
 * Centred card used by every page outside the authenticated app shell:
 * sign-in, sign-up, password reset, onboarding and invitation acceptance.
 *
 * The locale switcher is present here deliberately — a German-speaking user
 * must be able to change language *before* they have an account to store the
 * preference on.
 */
export async function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = await getTranslations("common");

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            <span aria-hidden>MC</span>
          </div>
          <span className="text-sm font-semibold">{t("appName")}</span>
        </div>
        <LocaleSwitcher />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
