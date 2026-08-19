"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ComboboxOption } from "@/components/combobox";
import { TaskDialog } from "./task-dialog";
import { TaskFilters } from "./task-filters";
import { TaskList } from "./task-list";
import type { TaskRow, TaskView } from "./types";

export function TaskBoard({
  tasks,
  view,
  assigneeId,
  priority,
  members,
  counts,
  timeZone,
}: {
  tasks: TaskRow[];
  view: TaskView;
  assigneeId: string | null;
  priority: string | null;
  members: ComboboxOption[];
  counts: { overdue: number; today: number };
  timeZone: string;
}) {
  const t = useTranslations("tasks");
  const [editing, setEditing] = useState<TaskRow | undefined>(undefined);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <TaskFilters
        view={view}
        assigneeId={assigneeId}
        priority={priority}
        members={members}
        counts={counts}
      />

      <TaskList
        tasks={tasks}
        timeZone={timeZone}
        emptyLabel={t(`empty_${view}`)}
        onEdit={(task) => {
          setEditing(task);
          setOpen(true);
        }}
      />

      <TaskDialog
        open={open}
        onOpenChange={setOpen}
        task={editing}
        members={members}
        timeZone={timeZone}
      />
    </div>
  );
}
