"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { undoImportJob } from "./actions";
import type { ImportJobSummary } from "./queries";

export function ImportHistory({ jobs }: { jobs: ImportJobSummary[] }) {
  const t = useTranslations("import");
  const tError = useTranslations("errors.action");
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>;
  }

  function onUndo(job: ImportJobSummary) {
    // Spelled out because "undo" implies more than it delivers: rows this run
    // *updated* keep their new values, since the old ones were never captured.
    if (!window.confirm(t("confirmUndo", { count: job.createdCount }))) return;

    startTransition(async () => {
      const result = await undoImportJob({ jobId: job.id });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(
        t("undoneToast", {
          contacts: result.data.contactsDeleted,
          companies: result.data.companiesDeleted,
        }),
      );
      router.refresh();
    });
  }

  return (
    <ul className="divide-y divide-border rounded-lg border">
      {jobs.map((job) => (
        <li key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{job.filename}</p>
            <p className="text-xs text-muted-foreground">
              {format.dateTime(new Date(job.createdAt), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {job.createdByName ? ` · ${job.createdByName}` : ""}
            </p>
          </div>

          <p className="text-xs text-muted-foreground tabular-nums">
            {t("historyCounts", {
              created: job.createdCount,
              updated: job.updatedCount,
              skipped: job.skippedCount,
              errors: job.errorCount,
            })}
          </p>

          <Badge
            variant={
              job.status === "completed"
                ? "default"
                : job.status === "rolled_back"
                  ? "outline"
                  : "secondary"
            }
          >
            {t(`status_${job.status}`)}
          </Badge>

          {job.canUndo ? (
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => onUndo(job)}>
              {t("undo")}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
