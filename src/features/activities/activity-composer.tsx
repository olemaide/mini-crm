"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { fromZonedTime } from "date-fns-tz";
import { CalendarClockIcon, MailIcon, PhoneIcon, StickyNoteIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionError } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { createActivity } from "./actions";
import type { ActivitySubjectKind, UserAuthoredType } from "./types";

const TABS = [
  { type: "note", icon: StickyNoteIcon },
  { type: "email_logged", icon: MailIcon },
  { type: "call_logged", icon: PhoneIcon },
  { type: "meeting_logged", icon: UsersIcon },
] as const satisfies readonly { type: UserAuthoredType; icon: typeof MailIcon }[];

/**
 * Toggle buttons rather than a real tablist: all four share one textarea, so
 * switching from "Note" to "Call" must not throw away what has been typed.
 * A tablist whose panels all render the same field would either duplicate the
 * DOM or lose the draft on every switch.
 */
export function ActivityComposer({
  subjectKind,
  subjectId,
  timeZone,
  onPosted,
}: {
  subjectKind: ActivitySubjectKind;
  subjectId: string;
  timeZone: string;
  onPosted?: () => void;
}) {
  const t = useTranslations("activities");
  const [type, setType] = useState<UserAuthoredType>("note");
  const [body, setBody] = useState("");
  const [backdating, setBackdating] = useState(false);
  const [occurredLocal, setOccurredLocal] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (body.trim() === "" || isPending) return;

    startTransition(async () => {
      setError(null);
      const result = await createActivity({
        subjectKind,
        subjectId,
        type,
        body,
        // A datetime-local value carries no zone. Interpreting it in the
        // browser's zone would silently shift the entry for anyone travelling
        // or working remotely, so it is anchored to the organization's zone.
        occurredAt:
          backdating && occurredLocal !== ""
            ? fromZonedTime(occurredLocal, timeZone).toISOString()
            : null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setBody("");
      setOccurredLocal("");
      setBackdating(false);
      toast.success(t("posted"));
      onPosted?.();
      textareaRef.current?.focus();
    });
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-[3px]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = type === tab.type;
          return (
            <button
              key={tab.type}
              type="button"
              aria-pressed={active}
              onClick={() => setType(tab.type)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(`compose_${tab.type}`)}
            </button>
          );
        })}
      </div>

      <Textarea
        ref={textareaRef}
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t(`placeholder_${type}`)}
        aria-label={t(`compose_${type}`)}
        // Ctrl/Cmd+Enter is the convention people already have in their fingers
        // from every other tool that has a comment box.
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />

      <ActionErrorMessage error={error} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={backdating}
            onClick={() => setBackdating((previous) => !previous)}
          >
            <CalendarClockIcon className="size-4" />
            {t("backdate")}
          </Button>
          {backdating ? (
            <Input
              type="datetime-local"
              className="h-8 w-auto"
              value={occurredLocal}
              aria-label={t("backdate")}
              onChange={(event) => setOccurredLocal(event.target.value)}
            />
          ) : null}
        </div>

        <Button size="sm" onClick={submit} disabled={isPending || body.trim() === ""}>
          {t("post")}
        </Button>
      </div>
    </div>
  );
}
