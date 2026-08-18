import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: "tooLong" })
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);

export const dealFormSchema = z.object({
  title: z.string().trim().min(1, { message: "required" }).max(200, { message: "tooLong" }),
  /** Raw as typed; parsed to integer cents server-side by parseMoneyToCents. */
  value: optionalText(30),
  stageId: z.uuid(),
  contactId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  companyId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  ownerId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  expectedCloseDate: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), { message: "date" }),
});

export const createDealSchema = dealFormSchema.extend({
  pipelineId: z.uuid(),
});

export const updateDealSchema = z.object({
  id: z.uuid(),
  data: dealFormSchema,
});

export const dealIdSchema = z.object({ id: z.uuid() });

/**
 * A drag. `position` is computed client-side from the neighbouring cards —
 * the browser is the only place that knows where the card was dropped.
 */
export const moveDealSchema = z.object({
  id: z.uuid(),
  stageId: z.uuid(),
  position: z.number().finite(),
  lostReason: optionalText(500),
});

export const setLostReasonSchema = z.object({
  id: z.uuid(),
  lostReason: optionalText(500),
});

// ---------------------------------------------------------------- stages

export const stageFormSchema = z.object({
  pipelineId: z.uuid(),
  name: z.string().trim().min(1, { message: "required" }).max(60, { message: "tooLong" }),
  probability: z.coerce
    .number()
    .min(0, { message: "probability" })
    .max(100, { message: "probability" }),
});

export const updateStageSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, { message: "required" }).max(60, { message: "tooLong" }),
  probability: z.coerce
    .number()
    .min(0, { message: "probability" })
    .max(100, { message: "probability" }),
});

export const reorderStageSchema = z.object({
  id: z.uuid(),
  position: z.number().finite(),
});

export const deleteStageSchema = z.object({
  id: z.uuid(),
  /** Where this stage's deals go. Required — deals are never deleted with it. */
  moveDealsToStageId: z.uuid(),
});

export type DealFormInput = z.input<typeof dealFormSchema>;
export type DealFormValues = z.output<typeof dealFormSchema>;
