import { z } from "zod";

/**
 * Shared between the client form and the Server Action, so validation cannot
 * drift between the two. The messages are intentionally terse identifiers, not
 * prose — forms translate them via the `errors.field` namespace.
 */

export const emailSchema = z.email({ message: "email" }).max(255).trim().toLowerCase();

/**
 * Eight characters is Supabase's default floor. Length beats composition rules
 * for real-world strength, so there is no "must contain a symbol" theatre here.
 */
export const passwordSchema = z
  .string()
  .min(8, { message: "passwordTooShort" })
  .max(72, { message: "passwordTooLong" });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "required" }),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, { message: "required" }).max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const magicLinkSchema = z.object({
  email: emailSchema,
});

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z.object({
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
