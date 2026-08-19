import Link from "next/link";
import { getNow, getTranslations } from "next-intl/server";
import { AlertTriangleIcon, ClockIcon } from "lucide-react";

import { getBillingState, trialDaysLeft } from "./queries";

/**
 * The app-wide billing banner.
 *
 * Rendered in the authenticated shell so a locked or expiring workspace is
 * visible from any page, not only from Settings — someone who cannot save a
 * contact needs to know why on the page where it failed.
 *
 * Silent while a trial has more than three days left; a permanent banner is
 * one people stop seeing.
 */
export async function BillingBanner({ organizationId }: { organizationId: string }) {
  const t = await getTranslations("billing");
  const state = await getBillingState(organizationId);
  if (!state) return null;

  const now = await getNow();
  const daysLeft = trialDaysLeft(state, now);

  if (!state.hasWriteAccess) {
    return (
      <Banner tone="danger">
        <AlertTriangleIcon className="size-4 shrink-0" />
        <span>{state.plan === "past_due" ? t("pastDueTitle") : t("lockedTitle")}</span>
        <Link href="/settings/billing" className="ml-auto shrink-0 font-medium underline">
          {t("choosePlan")}
        </Link>
      </Banner>
    );
  }

  if (state.plan === "past_due") {
    return (
      <Banner tone="danger">
        <AlertTriangleIcon className="size-4 shrink-0" />
        <span>{t("pastDueTitle")}</span>
        <Link href="/settings/billing" className="ml-auto shrink-0 font-medium underline">
          {t("managePortal")}
        </Link>
      </Banner>
    );
  }

  if (state.plan === "trial" && daysLeft <= 3) {
    return (
      <Banner tone="warning">
        <ClockIcon className="size-4 shrink-0" />
        <span>{t("trialTitle", { days: daysLeft })}</span>
        <Link href="/settings/billing" className="ml-auto shrink-0 font-medium underline">
          {t("choosePlan")}
        </Link>
      </Banner>
    );
  }

  return null;
}

function Banner({ tone, children }: { tone: "danger" | "warning"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === "danger"
          ? "flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          : "flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
      }
    >
      {children}
    </div>
  );
}
