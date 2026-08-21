import { z } from "zod";

import { locales } from "@/i18n/config";

export const orgNameSchema = z
  .string()
  .trim()
  .min(1, { message: "required" })
  .max(120, { message: "tooLong" });

/**
 * Fields are required rather than `.default()`-ed on purpose.
 *
 * A Zod default makes the *input* type optional while the *output* type stays
 * required, which react-hook-form's resolver cannot reconcile — the form ends
 * up typed as `FieldValues` and every field silently loses its type. Defaults
 * belong in the form's `defaultValues` (and, as a backstop, in the SQL
 * function signature).
 */
export const createOrganizationSchema = z.object({
  name: orgNameSchema,
  locale: z.enum(locales),
  timezone: z.string().min(1).max(64),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { message: "currency" }),
});

export const updateOrganizationSchema = z.object({
  organizationId: z.uuid(),
  name: orgNameSchema,
  locale: z.enum(locales),
  timezone: z.string().min(1).max(64),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { message: "currency" }),
});

export const inviteMemberSchema = z.object({
  organizationId: z.uuid(),
  email: z.email({ message: "email" }).max(255).trim().toLowerCase(),
  // 'owner' is deliberately absent: ownership transfer is a separate concern
  // and the database rejects it on invitations anyway.
  role: z.enum(["admin", "member"]),
});

export const invitationIdSchema = z.object({
  organizationId: z.uuid(),
  invitationId: z.uuid(),
});

export const memberRoleSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["owner", "admin", "member"]),
});

export const memberIdSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
});

export const switchOrganizationSchema = z.object({
  organizationId: z.uuid(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  locale: z.enum(locales),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

/**
 * Scheduling erasure (Phase 9 / DSGVO Art. 17).
 *
 * `confirmName` is not compared here. The database does it, inside
 * `request_organization_deletion()`, against the name as it is stored at that
 * moment — comparing in the app would race a rename and would also make the
 * check skippable by anyone calling the RPC directly.
 */
export const deleteOrganizationSchema = z.object({
  organizationId: z.uuid(),
  confirmName: z.string().trim().min(1, { message: "required" }).max(120),
});

export const organizationIdSchema = z.object({
  organizationId: z.uuid(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
