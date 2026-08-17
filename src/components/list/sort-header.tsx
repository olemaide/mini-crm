"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Column header that toggles sorting through the URL.
 *
 * A link rather than a button: sorting is a navigation, so it works with
 * middle-click, back/forward and copy-link — and it needs no client state.
 */
export function SortHeader({
  column,
  label,
  className,
  defaultDirection = "asc",
}: {
  column: string;
  label: string;
  className?: string;
  /** Direction applied on first click. Dates read better newest-first. */
  defaultDirection?: "asc" | "desc";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeSort = searchParams.get("sort");
  const activeDirection = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const isActive = activeSort === column;

  const nextDirection = isActive ? (activeDirection === "asc" ? "desc" : "asc") : defaultDirection;

  const next = new URLSearchParams(searchParams.toString());
  next.set("sort", column);
  next.set("dir", nextDirection);
  next.delete("page");

  const Icon = !isActive
    ? ChevronsUpDownIcon
    : activeDirection === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon;

  return (
    <Link
      href={`${pathname}?${next.toString()}`}
      scroll={false}
      aria-sort={isActive ? (activeDirection === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:text-foreground",
        isActive ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {label}
      <Icon className={cn("size-3.5", isActive ? "opacity-100" : "opacity-40")} />
    </Link>
  );
}
