"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";

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
import { createOrganization } from "@/features/organizations/actions";
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
} from "@/features/organizations/schema";
import { localeLabels, locales, type Locale } from "@/i18n/config";
import type { ActionError } from "@/lib/actions";
import { AFTER_LOGIN_PATH } from "@/lib/auth/constants";

/**
 * A short list beats a 400-entry IANA dropdown for a DACH-focused MVP.
 * Organization settings can widen this later without a migration.
 */
const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Warsaw",
  "UTC",
] as const;

const CURRENCIES = ["EUR", "CHF", "GBP", "USD"] as const;

export function CreateOrganizationForm() {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const activeLocale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: "",
      // Default the org language to whatever the person is already reading.
      locale: activeLocale,
      timezone: "Europe/Berlin",
      currency: "EUR",
    },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: CreateOrganizationInput) {
    setError(null);
    startTransition(async () => {
      const result = await createOrganization(values);
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
        <FieldLabel htmlFor="name">{t("nameLabel")}</FieldLabel>
        <Input
          id="name"
          autoFocus
          autoComplete="organization"
          placeholder={t("namePlaceholder")}
          aria-invalid={Boolean(form.formState.errors.name)}
          {...form.register("name")}
        />
        <FieldError>{fieldMessage(form.formState.errors.name?.message)}</FieldError>
      </Field>

      {/*
        Controller rather than watch()/setValue(): `watch` returns a value the
        React Compiler cannot memoize safely, so it bails out of optimising the
        whole component. Controller is also the idiomatic way to bind a
        controlled input like Select to react-hook-form.
      */}
      <Field>
        <FieldLabel htmlFor="locale">{t("localeLabel")}</FieldLabel>
        <Controller
          control={form.control}
          name="locale"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => value && field.onChange(value as Locale)}
            >
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {localeLabels[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldDescription>{t("localeHint")}</FieldDescription>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="timezone">{t("timezoneLabel")}</FieldLabel>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="currency">{t("currencyLabel")}</FieldLabel>
          <Controller
            control={form.control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tCommon("loading") : t("createAction")}
      </Button>
    </form>
  );
}
