import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { TriangleAlertIcon } from "lucide-react";

import { getPendingDeletion } from "./queries";

/**
 * The app-wide "this workspace is scheduled for deletion" notice.
 *
 * Deliberately unconditional — unlike the billing banner, this one never hides
 * itself after a few days. The whole reason the 30-day grace period exists is
 * that someone might change their mind, and a warning that fades is a warning
 * that arrives the day after the data is gone.
 *
 * Shown to every member, not just owners: a colleague who notices before the
 * owner does is exactly the recovery path worth having, and only an owner can
 * actually act on it.
 */
export async function DeletionBanner({ organizationId }: { organizationId: string }) {
  const pending = await getPendingDeletion(organizationId);
  if (!pending) return null;

  const t = await getTranslations("privacy");
  const format = await getFormatter();

  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <TriangleAlertIcon className="size-4 shrink-0" />
      <span>
        {t("pendingBanner", {
          date: format.dateTime(new Date(pending.scheduledFor), { dateStyle: "long" }),
        })}
      </span>
      <Link href="/settings/privacy" className="ml-auto shrink-0 font-medium underline">
        {t("cancelAction")}
      </Link>
    </div>
  );
}
