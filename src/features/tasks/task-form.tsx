"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
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
import { Textarea } from "@/components/ui/textarea";
import type { ActionError } from "@/lib/actions";
import { createTask, updateTask } from "./actions";
import { taskFormSchema, type TaskFormInput, type TaskFormValues } from "./schema";
import { TASK_PRIORITIES, type TaskRow } from "./types";

/** The record this task is being created against, when opened from its page. */
export type TaskLinkContext = {
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
};

export function TaskForm({
  task,
  members,
  timeZone,
  link,
  onDone,
}: {
  task?: TaskRow;
  members: ComboboxOption[];
  timeZone: string;
  link?: TaskLinkContext;
  onDone?: () => void;
}) {
  const t = useTranslations("tasks");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  /*
   * A datetime-local input has no timezone.
   *
   * Rendering the stored instant *in the organization's zone* and converting
   * back the same way is what keeps "09:00" meaning 09:00 to the team, rather
   * than shifting for whoever happens to be editing from another country.
   */
  const form = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      dueAt: task?.dueAt
        ? formatInTimeZone(new Date(task.dueAt), timeZone, "yyyy-MM-dd'T'HH:mm")
        : "",
      priority: task?.priority ?? "normal",
      assigneeId: task?.assignee?.id ?? null,
      // The existing link is carried forward from the task's own subject, so
      // editing a task never silently detaches it from its record.
      contactId: link?.contactId ?? (task?.link?.kind === "contact" ? task.link.id : null),
      companyId: link?.companyId ?? (task?.link?.kind === "company" ? task.link.id : null),
      dealId: link?.dealId ?? (task?.link?.kind === "deal" ? task.link.id : null),
    },
  });

  const priorityItems = TASK_PRIORITIES.map((value) => ({
    value,
    label: t(`priority_${value}`),
  }));

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: TaskFormValues) {
    setError(null);
    const payload = {
      ...values,
      dueAt: values.dueAt ? fromZonedTime(values.dueAt, timeZone).toISOString() : null,
    };

    startTransition(async () => {
      const result = task
        ? await updateTask({ id: task.id, data: payload })
        : await createTask(payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(task ? tCommon("saved") : t("createdToast"));
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="title">{t("taskTitle")}</FieldLabel>
        <Input id="title" autoFocus {...form.register("title")} />
        <FieldError>{fieldMessage(form.formState.errors.title?.message)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
        <Textarea id="description" rows={3} {...form.register("description")} />
        <FieldError>{fieldMessage(form.formState.errors.description?.message)}</FieldError>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="dueAt">{t("dueDate")}</FieldLabel>
          <Input id="dueAt" type="datetime-local" {...form.register("dueAt")} />
          <FieldDescription>{t("dueDateHint", { timeZone })}</FieldDescription>
          <FieldError>{fieldMessage(form.formState.errors.dueAt?.message)}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="priority">{t("priority")}</FieldLabel>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select
                items={priorityItems}
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="assigneeId">{t("assignee")}</FieldLabel>
        <Controller
          control={form.control}
          name="assigneeId"
          render={({ field }) => (
            <Combobox
              id="assigneeId"
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

      <div className="flex justify-end gap-2 pt-1">
        {onDone ? (
          <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
            {tCommon("cancel")}
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon("saving") : task ? tCommon("save") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
