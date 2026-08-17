"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * Shows the user a plain apology and a retry — never a stack trace. `digest` is
 * Next.js's server-side error id: it is safe to display and is the only thread
 * connecting a user's report to the corresponding server log line while Sentry
 * remains deferred (build plan §1.4).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");

  useEffect(() => {
    // Server errors are already logged server-side; this catches client-side
    // render failures, which otherwise leave no trace at all.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <TriangleAlertIcon className="size-5" />
      </div>
      <h1 className="text-lg font-semibold">{t("genericTitle")}</h1>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t("genericBody")}</p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">
          {t("digest", { digest: error.digest })}
        </p>
      ) : null}
      <Button onClick={reset} variant="outline" className="mt-2">
        {tCommon("retry")}
      </Button>
    </div>
  );
}
