"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";

import type { ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "./task-dialog";
import { TaskList } from "./task-list";
import type { TaskLinkContext } from "./task-form";
import type { TaskRow } from "./types";

/**
 * Open tasks for one record, on its detail page.
 *
 * Compact: the linked-record chip and assignee are hidden, because on a deal's
 * own page every task is on that deal and repeating it is noise.
 */
export function TaskWidget({
  tasks,
  members,
  timeZone,
  link,
}: {
  tasks: TaskRow[];
  members: ComboboxOption[];
  timeZone: string;
  link: TaskLinkContext;
}) {
  const t = useTranslations("tasks");
  const [editing, setEditing] = useState<TaskRow | undefined>(undefined);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <TaskList
        tasks={tasks}
        timeZone={timeZone}
        compact
        emptyLabel={t("noOpenTasks")}
        onEdit={(task) => {
          setEditing(task);
          setOpen(true);
        }}
      />

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => {
          setEditing(undefined);
          setOpen(true);
        }}
      >
        <PlusIcon className="size-4" />
        {t("addTask")}
      </Button>

      <TaskDialog
        open={open}
        onOpenChange={setOpen}
        task={editing}
        members={members}
        timeZone={timeZone}
        link={editing ? undefined : link}
      />
    </div>
  );
}
