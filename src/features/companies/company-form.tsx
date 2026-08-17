"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ActionErrorMessage } from "@/components/action-error";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionError } from "@/lib/actions";
import { createCompany, updateCompany } from "./actions";
import { companyFormSchema, type CompanyFormInput, type CompanyFormValues } from "./schema";
import type { CompanyDetail } from "./queries";

export function CompanyForm({
  members,
  company,
  onDone,
}: {
  members: ComboboxOption[];
  company?: CompanyDetail;
  onDone?: () => void;
}) {
  const t = useTranslations("companies");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm<CompanyFormInput, unknown, CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: company?.name ?? "",
      domain: company?.domain ?? "",
      industry: company?.industry ?? "",
      website: company?.website ?? "",
      phone: company?.phone ?? "",
      addressLine1: company?.addressLine1 ?? "",
      postalCode: company?.postalCode ?? "",
      city: company?.city ?? "",
      country: company?.country ?? "",
      notes: company?.notes ?? "",
      ownerId: company?.ownerId ?? null,
    },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: CompanyFormValues) {
    setError(null);
    startTransition(async () => {
      const result = company
        ? await updateCompany({ id: company.id, data: values })
        : await createCompany(values);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(company ? tCommon("saved") : t("createdMessage"));
      onDone?.();

      if (!company && "data" in result && result.data) {
        router.push(`/companies/${result.data.id}`);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
        <Input id="name" autoFocus {...form.register("name")} />
        <FieldError>{fieldMessage(form.formState.errors.name?.message)}</FieldError>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="domain">{t("domain")}</FieldLabel>
          <Input id="domain" placeholder="firma.de" {...form.register("domain")} />
          <FieldDescription>{t("domainHint")}</FieldDescription>
          <FieldError>{fieldMessage(form.formState.errors.domain?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="industry">{t("industry")}</FieldLabel>
          <Input id="industry" {...form.register("industry")} />
          <FieldError>{fieldMessage(form.formState.errors.industry?.message)}</FieldError>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="website">{t("website")}</FieldLabel>
          <Input id="website" {...form.register("website")} />
          <FieldError>{fieldMessage(form.formState.errors.website?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
          <Input id="phone" type="tel" {...form.register("phone")} />
          <FieldError>{fieldMessage(form.formState.errors.phone?.message)}</FieldError>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="addressLine1">{t("address")}</FieldLabel>
        <Input id="addressLine1" {...form.register("addressLine1")} />
        <FieldError>{fieldMessage(form.formState.errors.addressLine1?.message)}</FieldError>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="postalCode">{t("postalCode")}</FieldLabel>
          <Input id="postalCode" {...form.register("postalCode")} />
          <FieldError>{fieldMessage(form.formState.errors.postalCode?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="city">{t("city")}</FieldLabel>
          <Input id="city" {...form.register("city")} />
          <FieldError>{fieldMessage(form.formState.errors.city?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="country">{t("country")}</FieldLabel>
          <Input id="country" maxLength={2} className="uppercase" {...form.register("country")} />
          <FieldError>{fieldMessage(form.formState.errors.country?.message)}</FieldError>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="ownerId">{t("owner")}</FieldLabel>
        <Controller
          control={form.control}
          name="ownerId"
          render={({ field }) => (
            <Combobox
              id="ownerId"
              options={members}
              value={field.value ?? null}
              onChange={field.onChange}
              placeholder={t("unassigned")}
              searchPlaceholder={t("searchMembers")}
              emptyLabel={t("noMembersFound")}
              clearLabel={t("unassigned")}
            />
          )}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="notes">{t("notes")}</FieldLabel>
        <Textarea id="notes" rows={3} {...form.register("notes")} />
        <FieldError>{fieldMessage(form.formState.errors.notes?.message)}</FieldError>
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        {onDone ? (
          <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
            {tCommon("cancel")}
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon("saving") : company ? tCommon("save") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
