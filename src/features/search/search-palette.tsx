"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Building2Icon, KanbanIcon, SearchIcon, UsersIcon } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { centsToMajorUnit } from "@/lib/money";
import { searchEverything } from "./actions";
import type { SearchHit, SearchKind } from "./queries";

const ICONS: Record<SearchKind, typeof UsersIcon> = {
  contact: UsersIcon,
  company: Building2Icon,
  deal: KanbanIcon,
};

const PATHS: Record<SearchKind, string> = {
  contact: "/contacts",
  company: "/companies",
  deal: "/deals",
};

const KINDS = ["contact", "company", "deal"] as const;

const RECENT_KEY = "minicrm:recent-searches";
const RECENT_LIMIT = 5;

type Recent = { kind: SearchKind; id: string; label: string };

function readRecents(): Recent[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_LIMIT) as Recent[];
  } catch {
    // A corrupt or unavailable localStorage must never break the palette.
    return [];
  }
}

/**
 * The ⌘K / Ctrl+K palette.
 *
 * `shouldFilter={false}` is load-bearing. cmdk filters and reorders items
 * client-side by default, which is exactly wrong here: the server has already
 * ranked results across three tables by relevance, and a contact that matched
 * on its email or its employer's name would be filtered out again because
 * neither string appears in the label.
 */
export function SearchPalette() {
  const t = useTranslations("search");
  const format = useFormatter();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fetched, setFetched] = useState<SearchHit[]>([]);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [isPending, startTransition] = useTransition();

  // Identifies the newest request, so a slow early response cannot overwrite a
  // faster later one. Typing "an" then "anna" must not end up showing "an".
  const requestRef = useRef(0);

  /* localStorage is an external system, so it is read in the event handler
     that opens the dialog rather than in an effect reacting to `open`. */
  function changeOpen(next: boolean) {
    if (next) setRecents(readRecents());
    else setQuery("");
    setOpen(next);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        changeOpen(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    // 250 ms, per the build plan: long enough that a fast typist issues one
    // query instead of six, short enough to feel immediate.
    const id = ++requestRef.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchEverything({ query: trimmed });
        if (id !== requestRef.current) return;
        setFetched(result.ok ? result.data.items : []);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (hit: { kind: SearchKind; id: string; label: string }) => {
      const next = [
        { kind: hit.kind, id: hit.id, label: hit.label },
        ...readRecents().filter((r) => !(r.kind === hit.kind && r.id === hit.id)),
      ].slice(0, RECENT_LIMIT);

      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Private browsing, quota, or a blocked origin. Navigation still works.
      }

      setOpen(false);
      setQuery("");
      router.push(`${PATHS[hit.kind]}/${hit.id}`);
    },
    [router],
  );

  const trimmed = query.trim();
  /* Derived rather than cleared through setState: when the query drops back
     below two characters the previous results must vanish immediately, and
     deriving that is both simpler and free of a cascading render. */
  const hits = trimmed.length < 2 ? [] : fetched;
  const showRecents = trimmed.length < 2 && recents.length > 0;

  const money = (hit: SearchHit) =>
    typeof hit.extra.valueCents === "number"
      ? format.number(centsToMajorUnit(hit.extra.valueCents), {
          style: "currency",
          currency: hit.extra.currency ?? "EUR",
        })
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => changeOpen(true)}
        className="flex w-full max-w-64 items-center gap-2 rounded-md border border-input/60 bg-input/20 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="truncate">{t("placeholder")}</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          {t("shortcut")}
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        title={t("title")}
        description={t("description")}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("inputPlaceholder")}
          />
          <CommandList>
            {trimmed.length < 2 && !showRecents ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("typeToSearch")}</p>
            ) : null}

            {showRecents ? (
              <CommandGroup heading={t("recent")}>
                {recents.map((recent) => {
                  const Icon = ICONS[recent.kind];
                  return (
                    <CommandItem
                      key={`${recent.kind}-${recent.id}`}
                      value={`${recent.kind}-${recent.id}`}
                      onSelect={() => go(recent)}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className="truncate">{recent.label || t("unnamed")}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {trimmed.length >= 2 && hits.length === 0 ? (
              <CommandEmpty>{isPending ? t("searching") : t("noResults")}</CommandEmpty>
            ) : null}

            {KINDS.map((kind) => {
              const group = hits.filter((hit) => hit.kind === kind);
              if (group.length === 0) return null;

              return (
                <CommandGroup key={kind} heading={t(`group_${kind}`)}>
                  {group.map((hit) => {
                    const Icon = ICONS[kind];
                    const value = money(hit);
                    return (
                      <CommandItem
                        key={`${hit.kind}-${hit.id}`}
                        value={`${hit.kind}-${hit.id}`}
                        onSelect={() => go(hit)}
                      >
                        <Icon className="text-muted-foreground" />
                        <span className="truncate">{hit.label || t("unnamed")}</span>
                        {hit.sublabel ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {hit.sublabel}
                          </span>
                        ) : null}
                        {hit.extra.companyName && kind === "contact" ? (
                          <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                            {hit.extra.companyName}
                          </span>
                        ) : null}
                        {value ? (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                            {value}
                          </span>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
