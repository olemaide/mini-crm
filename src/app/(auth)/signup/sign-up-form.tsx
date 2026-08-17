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
import { signUp } from "@/features/auth/actions";
import { signUpSchema, type SignUpInput } from "@/features/auth/schema";
import type { ActionError } from "@/lib/actions";
import { ONBOARDING_PATH } from "@/lib/auth/constants";

export function SignUpForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);
  const [confirmationFor, setConfirmationFor] = useState<string | null>(null);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: SignUpInput) {
    setError(null);
    startTransition(async () => {
      const result = await signUp(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // With email confirmation enabled there is no session yet, so sending
      // them to onboarding would just bounce back to the login page.
      if (result.data.needsConfirmation) {
        setConfirmationFor(values.email);
        return;
      }

      router.replace(ONBOARDING_PATH);
      router.refresh();
    });
  }

  if (confirmationFor) {
    return (
      <div className="space-y-3 rounded-md border p-4 text-sm">
        <p className="font-medium">{t("checkYourEmail")}</p>
        <p className="text-muted-foreground">{t("confirmationSent", { email: confirmationFor })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="fullName">{t("fullNameLabel")}</FieldLabel>
        <Input
          id="fullName"
          autoComplete="name"
          autoFocus
          placeholder={t("fullNamePlaceholder")}
          aria-invalid={Boolean(form.formState.errors.fullName)}
          {...form.register("fullName")}
        />
        <FieldError>{fieldMessage(form.formState.errors.fullName?.message)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register("email")}
        />
        <FieldError>{fieldMessage(form.formState.errors.email?.message)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="password">{t("passwordLabel")}</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register("password")}
        />
        <FieldDescription>{t("passwordHint")}</FieldDescription>
        <FieldError>{fieldMessage(form.formState.errors.password?.message)}</FieldError>
      </Field>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tCommon("loading") : t("signUpAction")}
      </Button>
    </form>
  );
}
