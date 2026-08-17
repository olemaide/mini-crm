"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Debounced search box backed by the `q` query parameter.
 *
 * The input is locally controlled so typing stays responsive, and the URL is
 * updated 300 ms after the last keystroke. Every change also resets `page` —
 * without that, searching from page 7 lands on an empty page 7 of two results,
 * which reads as "no matches".
 */
export function ListSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);

  /*
   * Resync when the URL changes from elsewhere — browser back, or a cleared
   * filter. Done during render rather than in an effect: React handles a
   * setState in the render phase by re-running this component immediately,
   * without committing the stale value or painting it. An effect would render
   * the old text first, then correct it, and the React Compiler lint rules
   * reject it for exactly that reason.
   */
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (syncedQuery !== urlQuery) {
    setSyncedQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    if (value === urlQuery) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (value.trim() === "") next.delete("q");
      else next.set("q", value.trim());
      next.delete("page");

      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [value, urlQuery, pathname, router, searchParams]);

  return (
    <div className="relative w-full max-w-xs">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={tCommon("search")}
        data-pending={isPending ? "" : undefined}
        className="pr-8 pl-8"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={tCommon("cancel")}
          className="absolute top-1/2 right-0.5 size-7 -translate-y-1/2"
          onClick={() => setValue("")}
        >
          <XIcon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
