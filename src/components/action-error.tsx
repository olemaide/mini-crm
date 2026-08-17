"use client";

import { useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";

import type { ActionError } from "@/lib/actions";

/**
 * Renders a Server Action error.
 *
 * Actions return a translation *key*, never a rendered sentence, so the message
 * is composed in the reader's language here rather than frozen on the server
 * (build plan §3 rule 11). An unrecognised key degrades to the generic message
 * instead of showing the raw key to a user.
 */
export function ActionErrorMessage({ error }: { error: ActionError | null | undefined }) {
  const t = useTranslations("errors.action");
  const tErrors = useTranslations("errors");

  if (!error) return null;

  const key = error.key as Parameters<typeof t>[0];
  const message = t.has(key) ? t(key) : t("unexpected");

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p>{message}</p>
        {error.requestId ? (
          <p className="font-mono text-xs opacity-70">
            {tErrors("reference", { requestId: error.requestId })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
