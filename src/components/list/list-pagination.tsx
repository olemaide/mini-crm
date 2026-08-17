"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PAGE_SIZES } from "@/lib/list-params";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

export function ListPagination({
  page,
  pageSize,
  pageCount,
  total,
}: {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("list");
  const format = useFormatter();

  function hrefForPage(targetPage: number) {
    const next = new URLSearchParams(searchParams.toString());
    if (targetPage <= 1) next.delete("page");
    else next.set("page", String(targetPage));
    return `${pathname}?${next.toString()}`;
  }

  function onPageSizeChange(value: string | null) {
    if (!value) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("pageSize", value);
    // Row 900 of the old page size is not row 900 of the new one; jumping back
    // to page 1 is the only non-confusing behaviour.
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("showing", {
          from: format.number(firstRow),
          to: format.number(lastRow),
          total: format.number(total),
        })}
      </p>

      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
          <SelectTrigger size="sm" className="w-[4.5rem]" aria-label={t("rowsPerPage")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="px-1 text-sm text-muted-foreground tabular-nums">
          {t("pageOf", { page: format.number(page), pageCount: format.number(pageCount) })}
        </span>

        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          aria-label={t("previousPage")}
          render={
            page <= 1 ? (
              <button type="button" />
            ) : (
              <Link href={hrefForPage(page - 1)} scroll={false} />
            )
          }
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          disabled={page >= pageCount}
          aria-label={t("nextPage")}
          render={
            page >= pageCount ? (
              <button type="button" />
            ) : (
              <Link href={hrefForPage(page + 1)} scroll={false} />
            )
          }
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
