"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionError } from "@/lib/actions";
import { updateAutomationSettings } from "@/features/tasks/actions";
import { automationSettingsSchema } from "@/features/tasks/schema";
import type { AutomationSettings } from "@/features/tasks/queries";

export function AutomationForm({
  settings,
  canEdit,
}: {
  settings: AutomationSettings;
  canEdit: boolean;
}) {
  const t = useTranslations("automation");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const form = useForm({
    resolver: zodResolver(automationSettingsSchema),
    defaultValues: {
      leadTaskEnabled: settings.leadTaskEnabled,
      leadTaskTitle: settings.leadTaskTitle,
      leadTaskOffsetDays: settings.leadTaskOffsetDays,
    },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: {
    leadTaskEnabled: boolean;
    leadTaskTitle: string;
    leadTaskOffsetDays: number;
  }) {
    setError(null);
    startTransition(async () => {
      const result = await updateAutomationSettings(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(tCommon("saved"));
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-5" noValidate>
      <ActionErrorMessage error={error} />

      <Controller
        control={form.control}
        name="leadTaskEnabled"
        render={({ field }) => (
          <div className="flex items-start gap-3">
            <Checkbox
              id="leadTaskEnabled"
              checked={field.value}
              disabled={!canEdit}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              className="mt-0.5"
            />
            <div>
              <FieldLabel htmlFor="leadTaskEnabled">{t("leadTaskEnabled")}</FieldLabel>
              <FieldDescription>{t("leadTaskEnabledHint")}</FieldDescription>
            </div>
          </div>
        )}
      />

      <Field>
        <FieldLabel htmlFor="leadTaskTitle">{t("leadTaskTitle")}</FieldLabel>
        <Input id="leadTaskTitle" disabled={!canEdit} {...form.register("leadTaskTitle")} />
        {/* The title is the team's own text: it is stored as typed and is never
            re-translated when someone switches their interface language. */}
        <FieldDescription>{t("leadTaskTitleHint")}</FieldDescription>
        <FieldError>{fieldMessage(form.formState.errors.leadTaskTitle?.message)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="leadTaskOffsetDays">{t("leadTaskOffsetDays")}</FieldLabel>
        <Input
          id="leadTaskOffsetDays"
          type="number"
          min={0}
          max={30}
          disabled={!canEdit}
          className="w-28"
          {...form.register("leadTaskOffsetDays")}
        />
        <FieldDescription>{t("leadTaskOffsetDaysHint")}</FieldDescription>
        <FieldError>{fieldMessage(form.formState.errors.leadTaskOffsetDays?.message)}</FieldError>
      </Field>

      {canEdit ? (
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>
      )}
    </form>
  );
}
