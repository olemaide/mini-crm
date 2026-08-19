"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";

import type { ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskForm, type TaskLinkContext } from "./task-form";
import type { TaskRow } from "./types";

export function TaskDialog({
  open,
  onOpenChange,
  task,
  members,
  timeZone,
  link,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskRow;
  members: ComboboxOption[];
  timeZone: string;
  link?: TaskLinkContext;
}) {
  const t = useTranslations("tasks");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{task ? t("editSubtitle") : t("newSubtitle")}</DialogDescription>
        </DialogHeader>

        <TaskForm
          // Remounting on the task id resets the form when the dialog is
          // reopened for a different row; react-hook-form keeps defaultValues
          // from the first mount otherwise.
          key={task?.id ?? "new"}
          task={task}
          members={members}
          timeZone={timeZone}
          link={link}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** "New task" button plus its dialog, for page headers and widgets. */
export function NewTaskButton({
  members,
  timeZone,
  link,
  label,
  size = "sm",
  variant = "default",
}: {
  members: ComboboxOption[];
  timeZone: string;
  link?: TaskLinkContext;
  label: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
        {label}
      </Button>
      <TaskDialog
        open={open}
        onOpenChange={setOpen}
        members={members}
        timeZone={timeZone}
        link={link}
      />
    </>
  );
}
