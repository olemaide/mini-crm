"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  ArrowRightLeftIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  FileUpIcon,
  MailIcon,
  PencilLineIcon,
  PhoneIcon,
  SparklesIcon,
  StickyNoteIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { MarkdownLite } from "@/components/markdown-lite";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { centsToMajorUnit } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteActivity, updateActivity } from "./actions";
import {
  isUserAuthored,
  type ActivitySubjectKind,
  type ActivityType,
  type FeedItem,
} from "./types";

const ICONS: Record<ActivityType, typeof MailIcon> = {
  note: StickyNoteIcon,
  email_logged: MailIcon,
  call_logged: PhoneIcon,
  meeting_logged: UsersIcon,
  stage_changed: ArrowRightLeftIcon,
  deal_created: SparklesIcon,
  deal_won: TrophyIcon,
  deal_lost: CircleSlashIcon,
  contact_created: UserPlusIcon,
  company_created: UserPlusIcon,
  task_created: PencilLineIcon,
  task_completed: CheckCircle2Icon,
  field_changed: PencilLineIcon,
  import: FileUpIcon,
};

const SUBJECT_PATH: Record<ActivitySubjectKind, string> = {
  contact: "/contacts",
  company: "/companies",
  deal: "/deals",
};

function text(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function ActivityItem({
  item,
  pageSubjectKind,
  pageSubjectId,
  currentUserId,
  canModerate,
  onEdited,
  onRemoved,
}: {
  item: FeedItem;
  pageSubjectKind: ActivitySubjectKind;
  pageSubjectId: string;
  currentUserId: string;
  canModerate: boolean;
  onEdited: (id: number, body: string, editedAt: string | null) => void;
  onRemoved: (id: number) => void;
}) {
  const t = useTranslations("activities");
  const tError = useTranslations("errors.action");
  const format = useFormatter();
  // A per-request timestamp. `Date.now()` during render is impure, fails the
  // React Compiler lint, and mismatches between server and client HTML.
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body ?? "");
  const [isPending, startTransition] = useTransition();

  const authored = isUserAuthored(item.type);
  const isAuthor = item.actor?.id === currentUserId;
  const canEdit = authored && isAuthor;
  const canDelete = authored && (isAuthor || canModerate);

  const actorName = item.actor?.name?.trim() || t("unknownActor");
  const Icon = ICONS[item.type];

  // A rolled-up row belongs to something other than the record being viewed —
  // a deal's note showing on its contact's page. Without this the feed reads as
  // if everything happened to the record in front of you.
  const isRolledUp = item.subject.kind !== pageSubjectKind || item.subject.id !== pageSubjectId;

  const money = (cents: unknown, currency: unknown) =>
    typeof cents === "number"
      ? format.number(centsToMajorUnit(cents), {
          style: "currency",
          currency: typeof currency === "string" ? currency : "EUR",
        })
      : t("none");

  function systemSentence(): string {
    const meta = item.metadata;
    const from = text(meta, "from_stage_name") ?? t("none");
    const to = text(meta, "to_stage_name") ?? t("none");

    switch (item.type) {
      case "stage_changed":
        return t("event_stage_changed", { actor: actorName, from, to });
      case "deal_created":
        return t("event_deal_created", { actor: actorName, stage: to });
      case "deal_won":
        return t("event_deal_won", { actor: actorName });
      case "deal_lost":
        return t("event_deal_lost", { actor: actorName });
      case "contact_created":
        return t("event_contact_created", { actor: actorName });
      case "company_created":
        return t("event_company_created", { actor: actorName });
      case "import":
        return t("event_import");
      case "task_created":
        return t("event_task_created", { actor: actorName });
      case "task_completed":
        return t("event_task_completed", { actor: actorName });
      case "field_changed": {
        const field = text(meta, "field");
        if (field === "owner") {
          return t("event_field_owner", {
            actor: actorName,
            old: text(meta, "old") ?? t("unassigned"),
            new: text(meta, "new") ?? t("unassigned"),
          });
        }
        if (field === "value") {
          return t("event_field_value", {
            actor: actorName,
            old: money(meta.old, meta.currency),
            new: money(meta.new, meta.currency),
          });
        }
        if (field === "expected_close_date") {
          const asDate = (value: unknown) =>
            typeof value === "string"
              ? format.dateTime(new Date(value), { dateStyle: "medium" })
              : t("none");
          return t("event_field_expected_close_date", {
            actor: actorName,
            old: asDate(meta.old),
            new: asDate(meta.new),
          });
        }
        return t("event_field_generic", { actor: actorName, field: field ?? "" });
      }
      default:
        return t("event_unknown", { actor: actorName });
    }
  }

  function save() {
    if (draft.trim() === "") return;
    startTransition(async () => {
      const result = await updateActivity({ id: item.id, body: draft });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      setEditing(false);
      toast.success(t("saved"));
      onEdited(item.id, draft.trim(), result.data.editedAt);
    });
  }

  function remove() {
    if (!window.confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      const result = await deleteActivity({ id: item.id });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(t("deleted"));
      onRemoved(item.id);
    });
  }

  const occurred = new Date(item.occurredAt);

  return (
    <div className="flex gap-3 py-3">
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          authored ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          {authored ? (
            <span className="font-medium">{actorName}</span>
          ) : (
            <span className="text-muted-foreground">{systemSentence()}</span>
          )}
          {authored ? <span className="text-muted-foreground">{t(`did_${item.type}`)}</span> : null}

          <time
            dateTime={item.occurredAt}
            title={format.dateTime(occurred, { dateStyle: "full", timeStyle: "short" })}
            className="text-xs text-muted-foreground"
          >
            {format.relativeTime(occurred, now)}
          </time>

          {item.editedAt ? (
            <span
              className="text-xs text-muted-foreground italic"
              title={format.dateTime(new Date(item.editedAt), {
                dateStyle: "long",
                timeStyle: "short",
              })}
            >
              {t("edited")}
            </span>
          ) : null}

          {isRolledUp && item.subject.label ? (
            <Link
              href={`${SUBJECT_PATH[item.subject.kind]}/${item.subject.id}`}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("onSubject", { label: item.subject.label })}
            </Link>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              rows={3}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={t("editEntry")}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={isPending || draft.trim() === ""}>
                {t("save")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(item.body ?? "");
                  setEditing(false);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : item.body ? (
          <MarkdownLite source={item.body} className="mt-1 text-sm break-words" />
        ) : null}

        {!editing && (canEdit || canDelete) ? (
          <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
            {canEdit ? (
              <button
                type="button"
                className="underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setEditing(true)}
              >
                {t("edit")}
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                disabled={isPending}
                className="underline-offset-4 hover:text-destructive hover:underline"
                onClick={remove}
              >
                {t("delete")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
