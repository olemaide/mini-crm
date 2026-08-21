"use client";

import { useTranslations } from "next-intl";
import { DownloadIcon, FileJsonIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Download links, not fetch-and-Blob.
 *
 * `/api/export` sends `Content-Disposition: attachment`, so a plain anchor gets
 * the browser's own download UI, a progress indicator and a resumable transfer.
 * Pulling the file through `fetch` into a Blob would buffer a whole tenant's
 * data in the tab and lose all three.
 *
 * A client component only because it is a row of links with an icon; there is no
 * state here. It could be a Server Component, and is not, purely so the labels
 * stay next to the hrefs they describe.
 */
const CSV_ENTITIES = [
  { entity: "contacts", key: "exportContacts" },
  { entity: "companies", key: "exportCompanies" },
  { entity: "deals", key: "exportDeals" },
  { entity: "tasks", key: "exportTasks" },
  { entity: "activities", key: "exportActivities" },
] as const;

export function ExportButtons({ disabled }: { disabled: boolean }) {
  const t = useTranslations("privacy");

  if (disabled) {
    return <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        {/*
          `download` is only a hint here; the Content-Disposition header from the
          route is what actually names the file, and it embeds the organization
          and the date.
        */}
        <Button size="sm" render={<a href="/api/export?format=json" download />}>
          <FileJsonIcon className="size-4" />
          {t("exportJson")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {CSV_ENTITIES.map((item) => (
          <Button
            key={item.entity}
            variant="outline"
            size="sm"
            render={<a href={`/api/export?format=csv&entity=${item.entity}`} download />}
          >
            <DownloadIcon className="size-4" />
            {t(item.key)}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t("exportNote")}</p>
    </div>
  );
}
