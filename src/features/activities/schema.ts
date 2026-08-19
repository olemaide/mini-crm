import { z } from "zod";

import { FEED_FILTERS, USER_AUTHORED_TYPES } from "./types";

const subjectKind = z.enum(["contact", "company", "deal"]);

/**
 * `occurred_at` is optional; omitting it means "now".
 *
 * Backdating is the whole point of the field — people log Friday's call on
 * Monday. Future dates are refused here and again by a database trigger,
 * because an entry dated next week would pin itself to the top of the feed
 * until next week arrives.
 */
const occurredAt = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value === "" ? null : (value ?? null)))
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), { message: "date" })
  .refine((value) => value === null || Date.parse(value) <= Date.now() + 60_000, {
    message: "future",
  });

export const createActivitySchema = z.object({
  subjectKind,
  subjectId: z.uuid(),
  type: z.enum(USER_AUTHORED_TYPES),
  body: z.string().trim().min(1, { message: "required" }).max(10_000, { message: "tooLong" }),
  occurredAt,
});

export const updateActivitySchema = z.object({
  id: z.number().int().positive(),
  body: z.string().trim().min(1, { message: "required" }).max(10_000, { message: "tooLong" }),
  occurredAt,
});

export const deleteActivitySchema = z.object({ id: z.number().int().positive() });

export const loadFeedSchema = z.object({
  subjectKind,
  subjectId: z.uuid(),
  filter: z.enum(FEED_FILTERS),
  cursor: z
    .object({ occurredAt: z.string(), id: z.number().int() })
    .nullish()
    .transform((value) => value ?? null),
});

export type CreateActivityInput = z.input<typeof createActivitySchema>;
