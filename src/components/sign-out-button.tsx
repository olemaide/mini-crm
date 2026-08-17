"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { signOut } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton({
  variant = "link",
  className,
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      disabled={isPending}
      onClick={() => startTransition(() => void signOut())}
    >
      {t("signOut")}
    </Button>
  );
}
