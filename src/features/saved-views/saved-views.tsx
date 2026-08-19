"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookmarkIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { deleteView, saveView } from "./actions";
import type { SavedView, SavedViewResource } from "./queries";

/**
 * Named filter combinations, private to one user.
 *
 * A view is nothing but the current query string under a name, so saving is a
 * copy and restoring is a navigation. There is no second representation of a
 * filter to keep in step with the URL.
 */
export function SavedViews({
  resource,
  views,
}: {
  resource: SavedViewResource;
  views: SavedView[];
}) {
  const t = useTranslations("filters");
  const tError = useTranslations("errors.action");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const current = searchParams.toString();

  function save() {
    const trimmed = name.trim();
    if (trimmed === "") return;

    startTransition(async () => {
      const result = await saveView({ resource, name: trimmed, queryString: current });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      setName("");
      setOpen(false);
      toast.success(t("viewSaved"));
      router.refresh();
    });
  }

  function remove(view: SavedView) {
    startTransition(async () => {
      const result = await deleteView({ id: view.id });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(t("viewDeleted"));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((view) => {
        const active = view.queryString === current;
        return (
          <span
            key={view.id}
            className={cn(
              "group inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent bg-muted text-muted-foreground",
            )}
          >
            <button
              type="button"
              onClick={() =>
                router.push(view.queryString ? `${pathname}?${view.queryString}` : pathname)
              }
              className="hover:underline"
            >
              {view.name}
            </button>
            <button
              type="button"
              disabled={isPending}
              aria-label={t("deleteView", { name: view.name })}
              onClick={() => remove(view)}
              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <BookmarkIcon className="size-3.5" />
              {t("saveView")}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-64 space-y-2">
          <p className="text-xs text-muted-foreground">{t("saveViewHint")}</p>
          <Input
            value={name}
            autoFocus
            maxLength={60}
            placeholder={t("viewNamePlaceholder")}
            aria-label={t("viewName")}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={isPending || name.trim() === ""}
            onClick={save}
          >
            {t("saveView")}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
