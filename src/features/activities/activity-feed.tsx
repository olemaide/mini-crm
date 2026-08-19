"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadMoreActivities } from "./actions";
import { ActivityComposer } from "./activity-composer";
import { ActivityItem } from "./activity-item";
import {
  FEED_FILTERS,
  type ActivitySubjectKind,
  type FeedCursor,
  type FeedFilter,
  type FeedItem,
  type FeedPage,
} from "./types";

/** Newest first, de-duplicated by id — the same order the RPC returns. */
function mergeNewest(a: FeedItem[], b: FeedItem[]): FeedItem[] {
  const byId = new Map<number, FeedItem>();
  for (const item of [...a, ...b]) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => {
    if (left.occurredAt === right.occurredAt) return right.id - left.id;
    return left.occurredAt < right.occurredAt ? 1 : -1;
  });
}

export function ActivityFeed({
  subjectKind,
  subjectId,
  initialPage,
  currentUserId,
  canModerate,
  timeZone,
}: {
  subjectKind: ActivitySubjectKind;
  subjectId: string;
  initialPage: FeedPage;
  currentUserId: string;
  canModerate: boolean;
  timeZone: string;
}) {
  const t = useTranslations("activities");
  const tError = useTranslations("errors.action");
  const format = useFormatter();
  const now = useNow();

  const [filter, setFilter] = useState<FeedFilter>("all");
  const [items, setItems] = useState(initialPage.items);
  const [cursor, setCursor] = useState<FeedCursor | null>(initialPage.nextCursor);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (nextFilter: FeedFilter, nextCursor: FeedCursor | null) => {
      const result = await loadMoreActivities({
        subjectKind,
        subjectId,
        filter: nextFilter,
        cursor: nextCursor,
      });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return null;
      }
      return result.data;
    },
    [subjectKind, subjectId, tError],
  );

  function changeFilter(next: FeedFilter) {
    if (next === filter) return;
    setFilter(next);
    startTransition(async () => {
      const page = await fetchPage(next, null);
      if (!page) return;
      setItems(page.items);
      setCursor(page.nextCursor);
    });
  }

  const loadMore = useCallback(() => {
    if (!cursor) return;
    startTransition(async () => {
      const page = await fetchPage(filter, cursor);
      if (!page) return;
      setItems((previous) => mergeNewest(previous, page.items));
      setCursor(page.nextCursor);
    });
  }, [cursor, fetchPage, filter]);

  /**
   * Called after a new entry is posted.
   *
   * Re-reads page 1 and merges it in rather than resetting the list, so a
   * reader who has scrolled through six pages keeps all of them and simply
   * gains the new row at the top.
   */
  function onPosted() {
    const wasEmpty = items.length === 0;
    startTransition(async () => {
      const page = await fetchPage(filter, null);
      if (!page) return;
      setItems((previous) => mergeNewest(page.items, previous));
      // Only adopt the new cursor when there was nothing to page through
      // before; otherwise it would rewind past everything already loaded.
      if (wasEmpty) setCursor(page.nextCursor);
    });
  }

  // Edits and deletes are patched by id. Nothing else in the list moves, and
  // no page is lost.
  const onEdited = useCallback((id: number, body: string, editedAt: string | null) => {
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, body, editedAt } : item)),
    );
  }, []);

  const onRemoved = useCallback((id: number) => {
    setItems((previous) => previous.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor) return;

    // Auto-load on scroll. The button below stays visible and functional, so
    // this is never the only way to reach the next page.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  /*
   * Day boundaries come from the formatter, not from date maths.
   *
   * next-intl is already configured with the organization's timezone, so
   * formatting to a y/m/d string and comparing those strings puts an entry in
   * the right day for the org — which is not the same day the browser is in.
   */
  const dayKey = (iso: string) =>
    format.dateTime(new Date(iso), { year: "numeric", month: "2-digit", day: "2-digit" });

  const todayKey = dayKey(now.toISOString());
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000).toISOString());

  function dayLabel(iso: string): string {
    const key = dayKey(iso);
    if (key === todayKey) return t("today");
    if (key === yesterdayKey) return t("yesterday");
    return format.dateTime(new Date(iso), { dateStyle: "long" });
  }

  // Grouped up front rather than by tracking the previous label while mapping:
  // a variable reassigned inside a render callback is exactly what the React
  // Compiler refuses, and the grouped shape is clearer anyway.
  const days: { label: string; items: FeedItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.occurredAt);
    const current = days[days.length - 1];
    if (current?.label === label) current.items.push(item);
    else days.push({ label, items: [item] });
  }

  return (
    <div className="space-y-4">
      <ActivityComposer
        subjectKind={subjectKind}
        subjectId={subjectId}
        timeZone={timeZone}
        onPosted={onPosted}
      />

      <div className="flex flex-wrap gap-1.5 border-t pt-3">
        {FEED_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => changeFilter(option)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              filter === option
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`filter_${option}`)}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {filter === "all" ? t("empty") : t("emptyFiltered")}
        </p>
      ) : (
        days.map((day) => (
          <section key={day.label}>
            <h3 className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {day.label}
            </h3>
            <ul className="divide-y divide-border">
              {day.items.map((item) => (
                <li key={item.id}>
                  <ActivityItem
                    item={item}
                    pageSubjectKind={subjectKind}
                    pageSubjectId={subjectId}
                    currentUserId={currentUserId}
                    canModerate={canModerate}
                    onEdited={onEdited}
                    onRemoved={onRemoved}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <div ref={sentinelRef} aria-hidden />

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isPending}>
            {isPending ? t("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
