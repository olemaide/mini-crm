"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfile } from "@/features/organizations/actions";
import { updateProfileSchema, type UpdateProfileInput } from "@/features/organizations/schema";
import { localeLabels, locales, type Locale } from "@/i18n/config";
import type { ActionError } from "@/lib/actions";

export function ProfileForm({
  fullName,
  email,
  locale,
}: {
  fullName: string | null;
  email: string;
  locale: Locale;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: fullName ?? "", locale },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: UpdateProfileInput) {
    setError(null);
    startTransition(async () => {
      const result = await updateProfile(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(t("saved"));
      // The locale cookie may have changed, so the whole tree re-renders.
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="fullName">{t("fullNameLabel")}</FieldLabel>
        <Input
          id="fullName"
          autoComplete="name"
          aria-invalid={Boolean(form.formState.errors.fullName)}
          {...form.register("fullName")}
        />
        <FieldError>{fieldMessage(form.formState.errors.fullName?.message)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
        <Input id="email" value={email} readOnly disabled />
        <FieldDescription>{t("emailReadOnly")}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="locale">{t("languageTitle")}</FieldLabel>
        <Controller
          control={form.control}
          name="locale"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => value && field.onChange(value as Locale)}
            >
              <SelectTrigger id="locale" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((item) => (
                  <SelectItem key={item} value={item}>
                    {localeLabels[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldDescription>{t("languageBody")}</FieldDescription>
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? tCommon("saving") : tCommon("save")}
      </Button>
    </form>
  );
}
