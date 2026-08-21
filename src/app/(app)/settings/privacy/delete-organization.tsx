"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  cancelOrganizationDeletion,
  requestOrganizationDeletion,
} from "@/features/organizations/actions";
import type { ActionError } from "@/lib/actions";

/**
 * The danger zone.
 *
 * Two states in one component, because they are two halves of one decision:
 * nothing scheduled (offer to schedule) and something scheduled (offer to call
 * it off). Splitting them into separate components would duplicate the copy and
 * let the two drift.
 *
 * The confirmation is a retyped organization name rather than a second "are you
 * sure". A dialog that can be dismissed with Enter is not a confirmation; typing
 * the name is the only friction that reliably survives muscle memory. It is
 * checked in the database, not here — see `request_organization_deletion()`.
 */
export function DeleteOrganization({
  organizationId,
  organizationName,
  graceDays,
  canDelete,
  pendingUntil,
}: {
  organizationId: string;
  organizationName: string;
  graceDays: number;
  canDelete: boolean;
  pendingUntil: string | null;
}) {
  const t = useTranslations("privacy");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [isPending, startTransition] = useTransition();

  function schedule() {
    setError(null);
    startTransition(async () => {
      const result = await requestOrganizationDeletion({ organizationId, confirmName });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setConfirmName("");
      toast.success(
        t("scheduled", {
          date: format.dateTime(new Date(result.data.scheduledFor), { dateStyle: "long" }),
        }),
      );
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrganizationDeletion({ organizationId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(t("cancelled"));
    });
  }

  if (pendingUntil) {
    return (
      <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start gap-2.5">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">{t("pendingTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("pendingBody", {
                name: organizationName,
                date: format.dateTime(new Date(pendingUntil), { dateStyle: "long" }),
              })}
            </p>
          </div>
        </div>

        <ActionErrorMessage error={error} />

        {/*
          Cancelling is offered to anyone who can see this panel. The RPC still
          restricts it to owners — but an admin discovering a scheduled deletion
          should be able to try to stop it, not be told the button is not for them.
        */}
        <Button variant="outline" size="sm" disabled={isPending} onClick={cancel}>
          {t("cancelAction")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/30 p-4">
      <div>
        <h3 className="text-sm font-medium text-destructive">{t("dangerTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("dangerBody")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("graceNote", { days: graceDays })}</p>
      </div>

      {canDelete ? (
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          {t("deleteAction")}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setConfirmName("");
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialogBody", { name: organizationName, days: graceDays })}
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="confirmName">{t("confirmLabel")}</FieldLabel>
            <Input
              id="confirmName"
              autoFocus
              autoComplete="off"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("confirmHint", { name: organizationName })}
            </p>
          </Field>

          <ActionErrorMessage error={error} />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              // Disabled until the name matches, so the common typo never
              // reaches the server. The server checks anyway.
              disabled={
                isPending ||
                confirmName.trim().toLowerCase() !== organizationName.trim().toLowerCase()
              }
              onClick={schedule}
            >
              {t("confirmAction")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
