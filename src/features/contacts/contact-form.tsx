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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionError } from "@/lib/actions";
import { createContact, updateContact } from "./actions";
import { contactFormSchema, type ContactFormInput, type ContactFormValues } from "./schema";
import type { ContactDetail } from "./queries";

export type ContactFormProps = {
  companies: ComboboxOption[];
  members: ComboboxOption[];
  contact?: ContactDetail;
  onDone?: () => void;
};

export function ContactForm({ companies, members, contact, onDone }: ContactFormProps) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm<ContactFormInput, unknown, ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      jobTitle: contact?.jobTitle ?? "",
      linkedinUrl: contact?.linkedinUrl ?? "",
      notes: contact?.notes ?? "",
      companyId: contact?.companyId ?? null,
      ownerId: contact?.ownerId ?? null,
    },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: ContactFormValues) {
    setError(null);
    startTransition(async () => {
      const result = contact
        ? await updateContact({ id: contact.id, data: values })
        : await createContact(values);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(contact ? tCommon("saved") : t("createdMessage"));
      onDone?.();

      if (!contact && "data" in result && result.data) {
        router.push(`/contacts/${result.data.id}`);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="firstName">{t("firstName")}</FieldLabel>
          <Input id="firstName" autoFocus {...form.register("firstName")} />
          <FieldError>{fieldMessage(form.formState.errors.firstName?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="lastName">{t("lastName")}</FieldLabel>
          <Input id="lastName" {...form.register("lastName")} />
          <FieldError>{fieldMessage(form.formState.errors.lastName?.message)}</FieldError>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" type="email" {...form.register("email")} />
          <FieldError>{fieldMessage(form.formState.errors.email?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
          <Input id="phone" type="tel" {...form.register("phone")} />
          <FieldError>{fieldMessage(form.formState.errors.phone?.message)}</FieldError>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="companyId">{t("company")}</FieldLabel>
          <Controller
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <Combobox
                id="companyId"
                options={companies}
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

        <Field>
          <FieldLabel htmlFor="jobTitle">{t("jobTitle")}</FieldLabel>
          <Input id="jobTitle" {...form.register("jobTitle")} />
          <FieldError>{fieldMessage(form.formState.errors.jobTitle?.message)}</FieldError>
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
          <FieldLabel htmlFor="linkedinUrl">{t("linkedin")}</FieldLabel>
          <Input id="linkedinUrl" type="url" {...form.register("linkedinUrl")} />
          <FieldError>{fieldMessage(form.formState.errors.linkedinUrl?.message)}</FieldError>
        </Field>
      </div>

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
          {isPending ? tCommon("saving") : contact ? tCommon("save") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
