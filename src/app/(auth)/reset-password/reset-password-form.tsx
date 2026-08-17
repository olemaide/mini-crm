"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/features/auth/actions";
import { updatePasswordSchema, type UpdatePasswordInput } from "@/features/auth/schema";
import type { ActionError } from "@/lib/actions";
import { AFTER_LOGIN_PATH } from "@/lib/auth/constants";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "" },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: UpdatePasswordInput) {
    setError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(AFTER_LOGIN_PATH);
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="password">{t("newPasswordLabel")}</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register("password")}
        />
        <FieldDescription>{t("passwordHint")}</FieldDescription>
        <FieldError>{fieldMessage(form.formState.errors.password?.message)}</FieldError>
      </Field>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tCommon("loading") : t("updatePasswordAction")}
      </Button>
    </form>
  );
}
