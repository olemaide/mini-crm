import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileQuestionIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestionIcon className="size-5" />
      </div>
      <h1 className="text-lg font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t("notFoundBody")}</p>
      <Button render={<Link href="/" />} variant="outline" className="mt-2">
        {t("backHome")}
      </Button>
    </div>
  );
}
