"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/**
 * Asked whenever a deal moves into the Lost column.
 *
 * The reason is optional — a modal that cannot be dismissed just teaches people
 * to type "x" — but asking at the moment of loss is the only time anyone
 * actually remembers why. Collected here, it is what makes a loss-reason report
 * worth building later.
 */
export function LostReasonDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const t = useTranslations("pipeline");
  const tCommon = useTranslations("common");
  const [reason, setReason] = useState("");

  function close(next: boolean) {
    if (!next) {
      setReason("");
      onCancel();
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("lostTitle")}</DialogTitle>
          <DialogDescription>{t("lostSubtitle")}</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="lostReason">{t("lostReasonLabel")}</FieldLabel>
          <Textarea
            id="lostReason"
            rows={3}
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("lostReasonPlaceholder")}
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setReason("");
              onCancel();
            }}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={() => {
              onConfirm(reason.trim() === "" ? null : reason.trim());
              setReason("");
            }}
          >
            {t("markLost")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
