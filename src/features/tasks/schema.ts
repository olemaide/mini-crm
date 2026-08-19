import { z } from "zod";

import { TASK_PRIORITIES } from "./types";

const optionalUuid = z
  .uuid()
  .nullish()
  .transform((value) => value ?? null);

/**
 * `dueAt` arrives as a `datetime-local` string with no zone, and is converted
 * to an instant in the organization's timezone by the client before it gets
 * here — so what this validates is already an ISO instant.
 */
const dueAt = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value === "" ? null : (value ?? null)))
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), { message: "date" });

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, { message: "required" }).max(200, { message: "tooLong" }),
  description: z
    .string()
    .trim()
    .max(5000, { message: "tooLong" })
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null),
  dueAt,
  priority: z.enum(TASK_PRIORITIES),
  assigneeId: optionalUuid,
  contactId: optionalUuid,
  companyId: optionalUuid,
  dealId: optionalUuid,
});

/**
 * At most one linked record, matching the database check constraint.
 *
 * Validated here as well so the user gets a field error instead of a raw
 * constraint violation — the constraint stays as the thing that is actually
 * load-bearing.
 */
const atMostOneLink = <
  T extends { contactId: string | null; companyId: string | null; dealId: string | null },
>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  const links = [value.contactId, value.companyId, value.dealId].filter(Boolean);
  if (links.length > 1) {
    ctx.addIssue({ code: "custom", message: "oneLinkOnly", path: ["dealId"] });
  }
};

export const createTaskSchema = taskFormSchema.superRefine(atMostOneLink);

export const updateTaskSchema = z.object({
  id: z.uuid(),
  data: taskFormSchema.superRefine(atMostOneLink),
});

export const taskIdSchema = z.object({ id: z.uuid() });

export const setTaskStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["open", "completed", "cancelled"]),
});

export const automationSettingsSchema = z.object({
  leadTaskEnabled: z.boolean(),
  leadTaskTitle: z.string().trim().min(1, { message: "required" }).max(200, { message: "tooLong" }),
  leadTaskOffsetDays: z.coerce
    .number()
    .int()
    .min(0, { message: "range" })
    .max(30, { message: "range" }),
});

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;
