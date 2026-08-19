"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { ComboboxOption } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { TASK_PRIORITIES, TASK_VIEWS, type TaskView } from "./types";

/**
 * Tabs and filters, all held in the URL.
 *
 * Same rule as the contact and company lists: a view someone is looking at
 * should survive a reload, work with the back button, and be pasteable into a
 * chat message. Nothing here is component state.
 */
export function TaskFilters({
  view,
  assigneeId,
  priority,
  members,
  counts,
}: {
  view: TaskView;
  assigneeId: string | null;
  priority: string | null;
  members: ComboboxOption[];
  counts: { overdue: number; today: number };
}) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const searchParams = useSearchParams();

  function withParam(key: string, value: string | null): string {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    return `/tasks${next.size > 0 ? `?${next.toString()}` : ""}`;
  }

  const badge = (tab: TaskView) =>
    tab === "overdue" && counts.overdue > 0
      ? counts.overdue
      : tab === "today" && counts.today > 0
        ? counts.today
        : null;

  return (
    <div className="space-y-3">
      <nav className="flex gap-1 border-b">
        {TASK_VIEWS.map((tab) => {
          const count = badge(tab);
          const active = tab === view;

          return (
            <button
              key={tab}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => router.push(withParam("view", tab === "overdue" ? null : tab))}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`view_${tab}`)}
              {count !== null ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold",
                    tab === "overdue"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label={t("assignee_me")}
            active={assigneeId === "me"}
            href={withParam("assignee", assigneeId === "me" ? null : "me")}
          />
          <FilterChip
            label={t("assignee_anyone")}
            active={assigneeId === null}
            href={withParam("assignee", null)}
          />
          {members.slice(0, 4).map((member) => (
            <FilterChip
              key={member.value}
              label={member.label}
              active={assigneeId === member.value}
              href={withParam("assignee", assigneeId === member.value ? null : member.value)}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TASK_PRIORITIES.map((value) => (
            <FilterChip
              key={value}
              label={t(`priority_${value}`)}
              active={priority === value}
              href={withParam("priority", priority === value ? null : value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, active, href }: { label: string; active: boolean; href: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => router.push(href)}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
