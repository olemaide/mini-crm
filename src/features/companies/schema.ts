import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: "tooLong" })
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);

export const companySortColumns = ["created_at", "updated_at", "name"] as const;
export type CompanySortColumn = (typeof companySortColumns)[number];

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, { message: "required" }).max(200, { message: "tooLong" }),
  // Accepts a pasted URL or email; the normaliser reduces it to a bare domain.
  domain: optionalText(255),
  industry: optionalText(100),
  website: optionalText(500),
  phone: optionalText(50),
  addressLine1: optionalText(200),
  postalCode: optionalText(20),
  city: optionalText(100),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .refine((value) => value === null || /^[A-Z]{2}$/.test(value), { message: "country" }),
  notes: optionalText(10000),
  ownerId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
});

export const createCompanySchema = companyFormSchema;

export const updateCompanySchema = z.object({
  id: z.uuid(),
  data: companyFormSchema,
});

export const companyIdSchema = z.object({ id: z.uuid() });

export const companyIdsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
});

export type CompanyFormInput = z.input<typeof companyFormSchema>;
export type CompanyFormValues = z.output<typeof companyFormSchema>;
