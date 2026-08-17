import { z } from "zod";

/**
 * Contact validation, shared by the form, the Server Action and (in Phase 3)
 * the CSV importer.
 *
 * Messages are keys resolved against `errors.field`, never prose — the same
 * rule as everywhere else.
 *
 * Optional text fields accept `""` from an untouched form input and convert to
 * `null`, because the database stores absence as NULL. Without this every empty
 * field would fail its CHECK or store a meaningless empty string.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: "tooLong" })
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);

export const contactSortColumns = ["created_at", "updated_at", "name", "email"] as const;
export type ContactSortColumn = (typeof contactSortColumns)[number];

export const contactFormSchema = z
  .object({
    firstName: optionalText(100),
    lastName: optionalText(100),
    email: z
      .string()
      .trim()
      .max(255, { message: "tooLong" })
      .transform((value) => (value === "" ? null : value))
      .nullish()
      .transform((value) => value ?? null)
      .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
        message: "email",
      }),
    phone: optionalText(50),
    jobTitle: optionalText(150),
    linkedinUrl: optionalText(500),
    notes: optionalText(10000),
    companyId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    ownerId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
  })
  // Mirrors the contacts_needs_an_identity CHECK. Validating it here too turns
  // a raw constraint violation into a message pointing at the right field.
  .refine((data) => Boolean(data.firstName) || Boolean(data.lastName) || Boolean(data.email), {
    message: "contactNeedsIdentity",
    path: ["firstName"],
  });

export const createContactSchema = contactFormSchema;

export const updateContactSchema = z.object({
  id: z.uuid(),
  data: contactFormSchema,
});

export const contactIdSchema = z.object({ id: z.uuid() });

export const contactIdsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
});

export const bulkAssignOwnerSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  ownerId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
});

export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormValues = z.output<typeof contactFormSchema>;
