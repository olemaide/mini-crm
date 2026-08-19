import { calendarDaysBetween, dayRange, dueBucket } from "@/lib/tasks/due";

/**
 * Expected results for the task due-date logic.
 *
 * The interesting cases are all DST. Europe/Berlin springs forward on
 * 2026-03-29 and falls back on 2026-10-25, and on those days a "day" is 23 or
 * 25 hours long. Anything that divides a millisecond difference by 86,400,000
 * gets 0.96 or 1.04 and floors to the wrong number — which is exactly the
 * "1 day overdue" case in the Phase 6 acceptance criteria.
 *
 * Every case pins `now` explicitly, so these never depend on when they run.
 */
export type DueCase = {
  label: string;
  dueAt: string | null;
  now: string;
  timeZone: string;
  expected: string;
  why: string;
};

export const DUE_CASES: DueCase[] = [
  // ---- ordinary days
  {
    label: "due yesterday",
    dueAt: "2026-06-09T07:00:00Z",
    now: "2026-06-10T07:30:00Z",
    timeZone: "Europe/Berlin",
    expected: "overdue/1",
    why: "one calendar day late",
  },
  {
    label: "due two days ago",
    dueAt: "2026-06-08T07:00:00Z",
    now: "2026-06-10T07:30:00Z",
    timeZone: "Europe/Berlin",
    expected: "overdue/2",
    why: "plural branch of the ICU message",
  },
  {
    label: "due earlier today",
    dueAt: "2026-06-10T07:00:00Z",
    now: "2026-06-10T12:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "today/0",
    why: "past due but still today — amber, not red",
  },
  {
    label: "due later today",
    dueAt: "2026-06-10T15:00:00Z",
    now: "2026-06-10T07:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "today/0",
    why: "still ahead, same local day",
  },
  {
    label: "due in three days",
    dueAt: "2026-06-13T07:00:00Z",
    now: "2026-06-10T07:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "soon/3",
    why: "inside the seven-day window",
  },
  {
    label: "due in three weeks",
    dueAt: "2026-07-01T07:00:00Z",
    now: "2026-06-10T07:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "later/21",
    why: "beyond the window, shown as a date",
  },
  {
    label: "no due date",
    dueAt: null,
    now: "2026-06-10T07:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "none/0",
    why: "sorted last, grey",
  },

  // ---- spring forward: 2026-03-29, clocks jump 02:00 -> 03:00 (23-hour day)
  {
    label: "overdue across spring-forward",
    dueAt: "2026-03-28T08:00:00Z",
    now: "2026-03-30T07:30:00Z",
    timeZone: "Europe/Berlin",
    expected: "overdue/2",
    why: "DST — 46 elapsed hours span 2 calendar days, not 1.9",
  },
  {
    label: "one day late over the short day",
    dueAt: "2026-03-28T09:00:00Z",
    now: "2026-03-29T08:30:00Z",
    timeZone: "Europe/Berlin",
    expected: "overdue/1",
    why: "DST — only 23.5 hours elapsed, but it is still yesterday's task",
  },

  // ---- fall back: 2026-10-25, clocks repeat 02:00-03:00 (25-hour day)
  {
    label: "overdue across fall-back",
    dueAt: "2026-10-24T07:00:00Z",
    now: "2026-10-26T08:30:00Z",
    timeZone: "Europe/Berlin",
    expected: "overdue/2",
    why: "DST — 49.5 elapsed hours are 2 calendar days, not 2.06",
  },
  {
    label: "one day late over the long day",
    dueAt: "2026-10-24T07:00:00Z",
    now: "2026-10-25T08:30:00Z",
    timeZone: "Europe/Berlin",
    expected: "overdue/1",
    why: "DST — 25.5 hours is still one calendar day",
  },

  // ---- the timezone genuinely matters
  {
    label: "late evening in Berlin is still today",
    dueAt: "2026-06-10T20:00:00Z",
    now: "2026-06-10T21:30:00Z",
    timeZone: "Europe/Berlin",
    expected: "today/0",
    why: "23:30 local — the day has not rolled over yet",
  },
  {
    label: "same instant, seen from Auckland",
    dueAt: "2026-06-10T20:00:00Z",
    now: "2026-06-10T21:30:00Z",
    timeZone: "Pacific/Auckland",
    expected: "today/0",
    why: "already the 11th there, but both instants fall on the same local day",
  },
  {
    label: "four hours late, but a day late locally",
    dueAt: "2026-06-10T09:00:00Z",
    now: "2026-06-10T13:00:00Z",
    timeZone: "Pacific/Kiritimati",
    expected: "overdue/1",
    why: "UTC+14 — 23:00 on the 10th vs 03:00 on the 11th, so the pair straddles local midnight and four elapsed hours really are one calendar day late",
  },
];

export function runDueCase(testCase: DueCase): string {
  const { bucket, days } = dueBucket(testCase.dueAt, new Date(testCase.now), testCase.timeZone);
  return `${bucket}/${days}`;
}

/**
 * `dayRange` produces the boundaries the Today and Upcoming queries use, so a
 * wrong offset here silently mis-files every task.
 */
export type RangeCase = { label: string; now: string; timeZone: string; expected: string };

export const RANGE_CASES: RangeCase[] = [
  {
    label: "Berlin summer (UTC+2)",
    now: "2026-06-10T12:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "2026-06-09T22:00:00.000Z..2026-06-10T22:00:00.000Z",
  },
  {
    label: "Berlin winter (UTC+1)",
    now: "2026-01-15T12:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "2026-01-14T23:00:00.000Z..2026-01-15T23:00:00.000Z",
  },
  {
    label: "the 23-hour day",
    now: "2026-03-29T12:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "2026-03-28T23:00:00.000Z..2026-03-29T22:00:00.000Z",
  },
  {
    label: "the 25-hour day",
    now: "2026-10-25T12:00:00Z",
    timeZone: "Europe/Berlin",
    expected: "2026-10-24T22:00:00.000Z..2026-10-25T23:00:00.000Z",
  },
  {
    label: "UTC is its own boundary",
    now: "2026-06-10T12:00:00Z",
    timeZone: "UTC",
    expected: "2026-06-10T00:00:00.000Z..2026-06-11T00:00:00.000Z",
  },
];

export function runRangeCase(testCase: RangeCase): string {
  const { from, to } = dayRange(new Date(testCase.now), testCase.timeZone);
  return `${from.toISOString()}..${to.toISOString()}`;
}

/** The raw calendar-day count, isolated from the bucket rules. */
export const DAY_COUNT_CASES: {
  label: string;
  later: string;
  earlier: string;
  timeZone: string;
  expected: number;
}[] = [
  {
    label: "23-hour day still counts as 1",
    later: "2026-03-29T12:00:00Z",
    earlier: "2026-03-28T12:00:00Z",
    timeZone: "Europe/Berlin",
    expected: 1,
  },
  {
    label: "25-hour day still counts as 1",
    later: "2026-10-25T12:00:00Z",
    earlier: "2026-10-24T12:00:00Z",
    timeZone: "Europe/Berlin",
    expected: 1,
  },
  {
    label: "23 elapsed hours across midnight is 1 day",
    later: "2026-06-11T00:30:00Z",
    earlier: "2026-06-10T01:30:00Z",
    timeZone: "UTC",
    expected: 1,
  },
  {
    label: "one minute across midnight is 1 day",
    later: "2026-06-11T00:00:30Z",
    earlier: "2026-06-10T23:59:30Z",
    timeZone: "UTC",
    expected: 1,
  },
];

export function runDayCountCase(testCase: (typeof DAY_COUNT_CASES)[number]): number {
  return calendarDaysBetween(
    new Date(testCase.later),
    new Date(testCase.earlier),
    testCase.timeZone,
  );
}
