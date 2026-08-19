"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createPortalSession } from "./actions";

/** Invoices, card changes and cancellation all live in Polar's portal. */
export function PortalButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations("billing");
  const tError = useTranslations("errors.action");
  const [isPending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const result = await createPortalSession();
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      window.location.href = result.data.url;
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={disabled || isPending} onClick={open}>
      <ExternalLinkIcon className="size-4" />
      {isPending ? t("redirecting") : t("managePortal")}
    </Button>
  );
}
