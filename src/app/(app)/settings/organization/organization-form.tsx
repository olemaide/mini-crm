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
import { updateOrganization } from "@/features/organizations/actions";
import {
  updateOrganizationSchema,
  type UpdateOrganizationInput,
} from "@/features/organizations/schema";
import { localeLabels, locales, type Locale } from "@/i18n/config";
import type { ActionError } from "@/lib/actions";
import type { Organization } from "@/lib/auth/session";

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Warsaw",
  "UTC",
] as const;

export function OrganizationForm({
  organization,
  canEdit,
}: {
  organization: Organization;
  canEdit: boolean;
}) {
  const t = useTranslations("organization");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      organizationId: organization.id,
      name: organization.name,
      locale: (locales as readonly string[]).includes(organization.locale)
        ? (organization.locale as Locale)
        : "en",
      timezone: organization.timezone,
      currency: organization.currency,
    },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: UpdateOrganizationInput) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrganization(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  // The timezone the org already uses may not be in the short list; keep it
  // rather than silently switching them to Berlin on the next save.
  const timezoneOptions = TIMEZONES.includes(organization.timezone as (typeof TIMEZONES)[number])
    ? TIMEZONES
    : ([organization.timezone, ...TIMEZONES] as readonly string[]);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      {!canEdit ? (
        <p className="rounded-md border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          {t("adminOnly")}
        </p>
      ) : null}

      <Field>
        <FieldLabel htmlFor="name">{t("nameLabel")}</FieldLabel>
        <Input
          id="name"
          disabled={!canEdit}
          aria-invalid={Boolean(form.formState.errors.name)}
          {...form.register("name")}
        />
        <FieldError>{fieldMessage(form.formState.errors.name?.message)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="org-locale">{t("localeLabel")}</FieldLabel>
        <Controller
          control={form.control}
          name="locale"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => value && field.onChange(value as Locale)}
              disabled={!canEdit}
            >
              <SelectTrigger id="org-locale" className="max-w-xs">
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
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="timezone">{t("timezoneLabel")}</FieldLabel>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
                disabled={!canEdit}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((zone) => (
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
          <Input
            id="currency"
            maxLength={3}
            disabled={!canEdit}
            className="uppercase"
            aria-invalid={Boolean(form.formState.errors.currency)}
            {...form.register("currency")}
          />
          <FieldDescription>{t("currencyHint")}</FieldDescription>
          <FieldError>{fieldMessage(form.formState.errors.currency?.message)}</FieldError>
        </Field>
      </div>

      <Button type="submit" disabled={isPending || !canEdit}>
        {isPending ? tCommon("saving") : tCommon("save")}
      </Button>
    </form>
  );
}
