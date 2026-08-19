import { differenceInCalendarDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Due-date classification, in the organization's timezone.
 *
 * Two responsibilities are kept strictly apart here, per the build plan:
 * `date-fns-tz` does the timezone arithmetic, `next-intl` does the formatting.
 * Mixing them is how you get a task that says "due tomorrow" at 23:00 on the
 * day it is actually due.
 *
 * The whole file is pure and takes `now` as an argument — no `Date.now()`, so
 * it is safe during render (React Compiler), produces no hydration mismatch,
 * and can be fixture-tested against fixed instants.
 */

export type DueBucket = "overdue" | "today" | "soon" | "later" | "none";

/**
 * Whole calendar days between two instants, as counted in `timeZone`.
 *
 * Not `(a - b) / 86_400_000`. Across a DST boundary a day is 23 or 25 hours,
 * so the division yields 0.96 or 1.04 and the floor lands on the wrong day —
 * which is exactly the "1 day overdue" case in the acceptance criteria.
 * `differenceInCalendarDays` on zoned values counts date boundaries instead.
 */
export function calendarDaysBetween(later: Date, earlier: Date, timeZone: string): number {
  return differenceInCalendarDays(toZonedTime(later, timeZone), toZonedTime(earlier, timeZone));
}

export function dueBucket(
  dueAt: string | null,
  now: Date,
  timeZone: string,
): { bucket: DueBucket; days: number } {
  if (!dueAt) return { bucket: "none", days: 0 };

  const due = new Date(dueAt);
  // Positive = in the past by that many calendar days.
  const daysLate = calendarDaysBetween(now, due, timeZone);

  // Overdue is an instant comparison, not a day comparison: a task due at
  // 09:00 is overdue at 09:01, and the badge should say so the same morning.
  if (due.getTime() < now.getTime()) {
    return { bucket: daysLate === 0 ? "today" : "overdue", days: daysLate };
  }

  const daysAway = -daysLate;
  if (daysAway === 0) return { bucket: "today", days: 0 };
  if (daysAway <= 7) return { bucket: "soon", days: daysAway };
  return { bucket: "later", days: daysAway };
}

/**
 * Start and end of "today" in the organization's timezone, as UTC instants.
 *
 * Used to build the Today / Upcoming queries. Deriving the boundaries here and
 * passing instants to Postgres keeps the timezone rule in one place instead of
 * scattering `at time zone` across queries.
 */
export function dayRange(now: Date, timeZone: string, offsetDays = 0): { from: Date; to: Date } {
  const zoned = toZonedTime(now, timeZone);
  const year = zoned.getFullYear();
  const month = zoned.getMonth();
  const date = zoned.getDate() + offsetDays;

  // Constructed as a naive local time, then anchored to the zone — the same
  // shape as next_business_due_at() does in SQL.
  const startLocal = new Date(year, month, date, 0, 0, 0, 0);
  const endLocal = new Date(year, month, date + 1, 0, 0, 0, 0);

  return {
    from: fromZonedTime(startLocal, timeZone),
    to: fromZonedTime(endLocal, timeZone),
  };
}

/** Sort order for a task list: overdue first, then soonest, undated last. */
export const BUCKET_ORDER: Record<DueBucket, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
  none: 4,
};
