"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { seedDemoData } from "./actions";

/**
 * "Fill with sample data", shown only while the workspace is empty.
 *
 * The action refuses on a non-empty tenant, so the button disappearing and the
 * server saying no are two expressions of the same rule rather than a UI guess
 * that could drift from it.
 */
export function SeedDemoButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const t = useTranslations("dashboard");
  const tError = useTranslations("errors.action");
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await seedDemoData();
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(t("seedDone", { contacts: result.data.contacts, deals: result.data.deals }));
    });
  }

  return (
    <Button variant={variant} size="sm" disabled={isPending} onClick={run}>
      <SparklesIcon className="size-4" />
      {isPending ? t("seeding") : t("seedAction")}
    </Button>
  );
}
