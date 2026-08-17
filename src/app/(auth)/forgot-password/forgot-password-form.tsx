"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/features/auth/actions";
import { resetPasswordRequestSchema, type ResetPasswordRequestInput } from "@/features/auth/schema";
import type { ActionError } from "@/lib/actions";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm<ResetPasswordRequestInput>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { email: "" },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: ResetPasswordRequestInput) {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Always the same confirmation, whether or not the address exists —
      // otherwise this form enumerates registered users.
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="space-y-3 rounded-md border p-4 text-sm">
        <p className="font-medium">{t("checkYourEmail")}</p>
        <p className="text-muted-foreground">{t("resetLinkSent")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder={t("emailPlaceholder")}
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register("email")}
        />
        <FieldError>{fieldMessage(form.formState.errors.email?.message)}</FieldError>
      </Field>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tCommon("loading") : t("sendResetAction")}
      </Button>
    </form>
  );
}
