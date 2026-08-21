import "server-only";

import { dayRange, monthStart } from "@/lib/tasks/due";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dashboard figures.
 *
 * Everything here comes from `dashboard_summary()` in one round trip. The
 * previous version of the dashboard rendered constants with a "sample data"
 * notice; the aggregates it was waiting for exist now, so the notice is gone
 * along with the constants.
 *
 * Not cached, on purpose. These numbers are per tenant and change on every deal
 * moved, and a cache keyed on neither user nor organization is the shape that
 * shows one company another's pipeline. Same reasoning as the task badge in
 * Phase 6 and the billing state in Phase 8.
 */

export type DashboardStage = {
  id: string;
  name: string;
  dealCount: number;
  totalCents: number;
};

export type OnboardingChecklist = {
  hasContacts: boolean;
  hasImported: boolean;
  hasDeal: boolean;
  hasTeammate: boolean;
  hasCompletedTask: boolean;
};

export type DashboardSummary = {
  currency: string;
  pipelineId: string | null;
  openDeals: number;
  pipelineCents: number;
  weightedCents: number;
  wonThisMonth: number;
  wonThisMonthCents: number;
  lostThisMonth: number;
  overdueTasks: number;
  dueTodayTasks: number;
  myOverdueTasks: number;
  contacts: number;
  companies: number;
  members: number;
  stages: DashboardStage[];
  checklist: OnboardingChecklist;
};

/**
 * The whole dashboard in one call.
 *
 * `now` is passed in rather than read from the clock here: the page gets it from
 * next-intl's `getNow()`, which is the same instant the formatter will use to
 * render it. Calling `new Date()` inside would produce a value a few
 * milliseconds off the one displayed and, worse, make the render
 * non-deterministic.
 *
 * Returns null on failure rather than throwing. A dashboard that cannot load its
 * numbers should say so; it should not take down the app shell around it.
 */
export async function getDashboardSummary(
  organizationId: string,
  timeZone: string,
  now: Date,
  userId: string,
): Promise<DashboardSummary | null> {
  const supabase = await createSupabaseServerClient();
  const today = dayRange(now, timeZone);

  const { data, error } = await supabase.rpc("dashboard_summary", {
    p_organization_id: organizationId,
    p_now: now.toISOString(),
    p_today_end: today.to.toISOString(),
    p_month_start: monthStart(now, timeZone).toISOString(),
    p_user_id: userId,
  });

  if (error || !data) return null;
  return data as unknown as DashboardSummary;
}

/** True when the tenant has no business data at all — the day-one state. */
export function isEmptyWorkspace(summary: DashboardSummary): boolean {
  return summary.contacts === 0 && summary.companies === 0 && summary.openDeals === 0;
}

/** How many of the five onboarding steps are done. */
export function checklistProgress(checklist: OnboardingChecklist): {
  done: number;
  total: number;
} {
  const steps = Object.values(checklist);
  return { done: steps.filter(Boolean).length, total: steps.length };
}
