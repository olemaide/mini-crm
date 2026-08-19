import type { Metadata } from "next";
import { getNow, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { getOrganizationMembers } from "@/features/organizations/queries";
import { NewTaskButton } from "@/features/tasks/task-dialog";
import { getTaskCounts, listTasks } from "@/features/tasks/queries";
import { TaskBoard } from "@/features/tasks/task-board";
import {
  TASK_PRIORITIES,
  TASK_VIEWS,
  type TaskPriority,
  type TaskView,
} from "@/features/tasks/types";
import { listSavedViews } from "@/features/saved-views/queries";
import { SavedViews } from "@/features/saved-views/saved-views";
import { requireSession } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("title") };
}

function parseView(value: string | undefined): TaskView {
  return TASK_VIEWS.includes(value as TaskView) ? (value as TaskView) : "overdue";
}

function parsePriority(value: string | undefined): TaskPriority | null {
  return TASK_PRIORITIES.includes(value as TaskPriority) ? (value as TaskPriority) : null;
}

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const t = await getTranslations("tasks");
  const tContacts = await getTranslations("contacts");
  const session = await requireSession();
  const params = await searchParams;

  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const view = parseView(first(params.view));
  const priority = parsePriority(first(params.priority));
  const rawAssignee = first(params.assignee) ?? null;
  // "me" is resolved server-side so the URL stays shareable between colleagues
  // and still means "mine" for whoever opens it.
  const assigneeId = rawAssignee === "me" ? session.user.id : rawAssignee;

  // A stable per-request timestamp, so the "today" boundary cannot shift
  // between the counts query and the list query.
  const now = await getNow();
  const timeZone = session.organization.timezone;

  const [tasks, counts, members, savedViews] = await Promise.all([
    listTasks(session.organization.id, timeZone, now, { view, assigneeId, priority }),
    getTaskCounts(session.organization.id, timeZone, now, session.user.id),
    getOrganizationMembers(session.organization.id),
    listSavedViews("tasks"),
  ]);

  const memberOptions = members.map((member) => ({
    value: member.userId,
    label: member.fullName?.trim() || tContacts("unnamed"),
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <NewTaskButton members={memberOptions} timeZone={timeZone} label={t("newTitle")} />
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <SavedViews resource="tasks" views={savedViews} />

        <TaskBoard
          tasks={tasks}
          view={view}
          assigneeId={rawAssignee}
          priority={priority}
          members={memberOptions}
          counts={counts}
          timeZone={timeZone}
        />
      </div>
    </>
  );
}
