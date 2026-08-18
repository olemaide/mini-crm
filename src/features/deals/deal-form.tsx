"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ActionErrorMessage } from "@/components/action-error";
import { Combobox, type ComboboxOption } from "@/components/combobox";
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
import type { ActionError } from "@/lib/actions";
import { centsToInput } from "@/lib/money";
import { createDeal, updateDeal } from "./actions";
import { dealFormSchema, type DealFormInput, type DealFormValues } from "./schema";
import type { DealDetail, StageOption } from "./queries";

/** A contact plus the company it works for, so the two pickers can constrain
    each other without a round trip. */
export type DealContactOption = ComboboxOption & { companyId: string | null };

export function DealForm({
  pipelineId,
  stages,
  contacts,
  companies,
  members,
  currency,
  deal,
  defaultStageId,
  onDone,
}: {
  pipelineId: string;
  stages: StageOption[];
  contacts: DealContactOption[];
  companies: ComboboxOption[];
  members: ComboboxOption[];
  currency: string;
  deal?: DealDetail;
  defaultStageId?: string;
  onDone?: () => void;
}) {
  const t = useTranslations("pipeline");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm<DealFormInput, unknown, DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      title: deal?.title ?? "",
      value: deal ? centsToInput(deal.valueCents) : "",
      stageId: deal?.stageId ?? defaultStageId ?? stages[0]?.id ?? "",
      contactId: deal?.contactId ?? null,
      companyId: deal?.companyId ?? null,
      ownerId: deal?.ownerId ?? null,
      expectedCloseDate: deal?.expectedCloseDate ?? "",
    },
  });

  /* Base UI prints the raw value in the trigger unless the root can map values
     to labels — without this the stage field reads as a bare UUID. */
  const stageItems = stages.map((stage) => ({ value: stage.id, label: stage.name }));

  // useWatch, not form.watch: the latter returns an unmemoizable function that
  // makes the React Compiler skip this component wholesale.
  const contactId = useWatch({ control: form.control, name: "contactId" });
  const companyId = useWatch({ control: form.control, name: "companyId" });
  const contactCompanyId = contacts.find((c) => c.value === contactId)?.companyId ?? null;

  /**
   * The two pickers constrain each other: a deal can't sit with a contact at
   * one company and the deal itself at another.
   *
   * Picking a contact fills in its employer and rules out every other company.
   * Picking a company the other way round rules out everyone who doesn't work
   * there — but only when the company was chosen on its own. A company that
   * came from the contact must not lock the contact picker, or swapping to a
   * contact elsewhere would be impossible without clearing the field first.
   *
   * The current selection is never disabled. Links change after a deal is
   * written, and a stale pairing has to stay visible and restorable.
   */
  const companyOptions = contactCompanyId
    ? companies.map((company) => ({
        ...company,
        disabled: company.value !== contactCompanyId && company.value !== companyId,
      }))
    : companies;

  const contactOptions =
    companyId && !contactCompanyId
      ? contacts.map((contact) => ({
          ...contact,
          disabled: contact.companyId !== companyId && contact.value !== contactId,
        }))
      : contacts;

  function onContactChange(next: string | null) {
    form.setValue("contactId", next, { shouldDirty: true });
    const employer = next ? (contacts.find((c) => c.value === next)?.companyId ?? null) : null;
    if (employer) form.setValue("companyId", employer, { shouldDirty: true });
  }

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: DealFormValues) {
    setError(null);
    startTransition(async () => {
      const result = deal
        ? await updateDeal({ id: deal.id, data: values })
        : await createDeal({ ...values, pipelineId });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(deal ? tCommon("saved") : t("createdMessage"));
      onDone?.();

      if (!deal && "data" in result && result.data) {
        router.push(`/deals/${result.data.id}`);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="title">{t("dealTitle")}</FieldLabel>
        <Input id="title" autoFocus {...form.register("title")} />
        <FieldError>{fieldMessage(form.formState.errors.title?.message)}</FieldError>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="value">{t("dealValue", { currency })}</FieldLabel>
          <Input id="value" inputMode="decimal" placeholder="12500" {...form.register("value")} />
          {/* Both grammars parse — the file's locale has nothing to do with
              the user's interface language. */}
          <FieldDescription>{t("valueHint")}</FieldDescription>
          <FieldError>{fieldMessage(form.formState.errors.value?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="stageId">{t("stage")}</FieldLabel>
          <Controller
            control={form.control}
            name="stageId"
            render={({ field }) => (
              <Select
                items={stageItems}
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
              >
                <SelectTrigger id="stageId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="contactId">{t("contact")}</FieldLabel>
          <Controller
            control={form.control}
            name="contactId"
            render={({ field }) => (
              <Combobox
                id="contactId"
                options={contactOptions}
                value={field.value ?? null}
                onChange={onContactChange}
                placeholder={t("noContact")}
                searchPlaceholder={t("searchContacts")}
                emptyLabel={t("noContactsFound")}
                clearLabel={t("noContact")}
              />
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="companyId">{t("company")}</FieldLabel>
          <Controller
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <Combobox
                id="companyId"
                options={companyOptions}
                value={field.value ?? null}
                onChange={field.onChange}
                placeholder={t("noCompany")}
                searchPlaceholder={t("searchCompanies")}
                emptyLabel={t("noCompaniesFound")}
                clearLabel={t("noCompany")}
              />
            )}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          <FieldLabel htmlFor="expectedCloseDate">{t("expectedClose")}</FieldLabel>
          <Input id="expectedCloseDate" type="date" {...form.register("expectedCloseDate")} />
          <FieldError>{fieldMessage(form.formState.errors.expectedCloseDate?.message)}</FieldError>
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onDone ? (
          <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
            {tCommon("cancel")}
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon("saving") : deal ? tCommon("save") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
