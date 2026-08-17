"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/features/organizations/actions";
import type { ActionError } from "@/lib/actions";
import { AFTER_LOGIN_PATH } from "@/lib/auth/constants";

export function AcceptInvitationForm({ token }: { token: string }) {
  const t = useTranslations("invite");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  function onAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitation({ token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(AFTER_LOGIN_PATH);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ActionErrorMessage error={error} />
      <Button className="w-full" onClick={onAccept} disabled={isPending}>
        {isPending ? tCommon("loading") : t("acceptAction")}
      </Button>
    </div>
  );
}
