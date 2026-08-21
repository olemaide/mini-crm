import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { checklistProgress, type OnboardingChecklist } from "./queries";

/**
 * The activation checklist (build plan §9, Launch readiness).
 *
 * Every item is derived from the database on each render — see the `checklist`
 * object in `dashboard_summary()`. Nothing is stored, so nothing can claim a step
 * is done after the user undid the import that completed it.
 *
 * A Server Component: it is five links and five ticks, and there is no reason to
 * ship JavaScript for that. It disappears once all five are done rather than
 * lingering as a permanently green box nobody reads.
 */
const STEPS = [
  { key: "hasContacts", href: "/contacts" },
  { key: "hasImported", href: "/contacts/import" },
  { key: "hasDeal", href: "/pipeline" },
  { key: "hasTeammate", href: "/settings/members" },
  { key: "hasCompletedTask", href: "/tasks" },
] as const satisfies readonly { key: keyof OnboardingChecklist; href: string }[];

export async function OnboardingChecklistCard({ checklist }: { checklist: OnboardingChecklist }) {
  const t = await getTranslations("dashboard.onboarding");
  const { done, total } = checklistProgress(checklist);

  if (done === total) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-3 text-sm font-medium">
          <span>{t("title")}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {t("progress", { done, total })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {STEPS.map((step) => {
            const isDone = checklist[step.key];

            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className="group flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-foreground"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6rem]",
                      isDone
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border text-transparent",
                    )}
                  >
                    <CheckIcon className="size-3" />
                  </span>

                  <span
                    className={cn(
                      "flex-1",
                      isDone ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {t(step.key)}
                  </span>

                  {/* The screen-reader equivalent of the tick and the strike-through. */}
                  <span className="sr-only">{isDone ? t("stateDone") : t("stateTodo")}</span>

                  {isDone ? null : (
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
