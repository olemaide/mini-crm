"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { dueBucket } from "@/lib/tasks/due";

const TONE = {
  overdue: "text-destructive",
  today: "text-amber-600 dark:text-amber-500",
  soon: "text-muted-foreground",
  later: "text-muted-foreground",
  none: "text-muted-foreground/70",
} as const;

/**
 * The due-date label: "2 days overdue", "Today", "in 3 days".
 *
 * Pluralization comes from an ICU message, not from string concatenation —
 * German needs "1 Tag überfällig" / "2 Tage überfällig" and English needs
 * "day"/"days", and neither is derivable by appending an "s".
 *
 * `useNow()` rather than `Date.now()`: a per-request timestamp keeps the server
 * and client HTML identical and stays pure during render.
 */
export function DueBadge({
  dueAt,
  timeZone,
  completedAt,
  className,
}: {
  dueAt: string | null;
  timeZone: string;
  completedAt?: string | null;
  className?: string;
}) {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const now = useNow();

  if (completedAt) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {t("completedOn", {
          date: format.dateTime(new Date(completedAt), { dateStyle: "medium" }),
        })}
      </span>
    );
  }

  const { bucket, days } = dueBucket(dueAt, now, timeZone);

  const label = (() => {
    switch (bucket) {
      case "none":
        return t("noDueDate");
      case "overdue":
        return t("overdueBy", { days });
      case "today":
        return t("dueToday");
      case "soon":
        return t("dueIn", { days });
      default:
        return format.dateTime(new Date(dueAt!), { dateStyle: "medium" });
    }
  })();

  return (
    <span
      className={cn("text-xs", TONE[bucket], bucket === "overdue" && "font-medium", className)}
      title={
        dueAt
          ? format.dateTime(new Date(dueAt), { dateStyle: "full", timeStyle: "short" })
          : undefined
      }
    >
      {label}
    </span>
  );
}
