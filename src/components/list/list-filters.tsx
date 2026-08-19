"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";

import type { ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CONTACT_SOURCES } from "@/lib/list-params";

/**
 * Filters for the contacts list.
 *
 * Every control writes to the URL and nothing is component state, so a filtered
 * view survives a reload, works with back/forward, and can be pasted to a
 * colleague. Changing any filter also resets to page 1 — staying on page 7 of a
 * result set that now has two pages shows an empty table and looks broken.
 */
export function ListFilters({
  owners,
  companies,
  currentUserId,
}: {
  owners: ComboboxOption[];
  companies: ComboboxOption[];
  currentUserId: string;
}) {
  const t = useTranslations("filters");
  const tContacts = useTranslations("contacts");
  const router = useRouter();
  const searchParams = useSearchParams();

  const get = (key: string) => searchParams.get(key);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    router.push(`/contacts${next.size > 0 ? `?${next.toString()}` : ""}`);
  }

  const owner = get("owner");
  const company = get("company");
  const source = get("source");
  const hasEmail = get("hasEmail");
  const from = get("from") ?? "";
  const to = get("to") ?? "";

  const active =
    owner !== null ||
    company !== null ||
    source !== null ||
    hasEmail !== null ||
    from !== "" ||
    to !== "" ||
    get("q") !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <FilterGroup label={t("owner")}>
        <Chip
          label={t("mine")}
          active={owner === currentUserId}
          onClick={() => apply({ owner: owner === currentUserId ? null : currentUserId })}
        />
        {owners
          .filter((option) => option.value !== currentUserId)
          .slice(0, 3)
          .map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={owner === option.value}
              onClick={() => apply({ owner: owner === option.value ? null : option.value })}
            />
          ))}
      </FilterGroup>

      {companies.length > 0 ? (
        <FilterGroup label={t("company")}>
          <select
            value={company ?? ""}
            onChange={(event) => apply({ company: event.target.value || null })}
            aria-label={t("company")}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="">{t("any")}</option>
            {companies.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterGroup>
      ) : null}

      <FilterGroup label={t("source")}>
        {CONTACT_SOURCES.map((value) => (
          <Chip
            key={value}
            label={tContacts(`source_${value}`)}
            active={source === value}
            onClick={() => apply({ source: source === value ? null : value })}
          />
        ))}
      </FilterGroup>

      <FilterGroup label={t("email")}>
        <Chip
          label={t("hasEmail")}
          active={hasEmail === "1"}
          onClick={() => apply({ hasEmail: hasEmail === "1" ? null : "1" })}
        />
        <Chip
          label={t("noEmail")}
          active={hasEmail === "0"}
          onClick={() => apply({ hasEmail: hasEmail === "0" ? null : "0" })}
        />
      </FilterGroup>

      <FilterGroup label={t("created")}>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          aria-label={t("createdFrom")}
          onChange={(event) => apply({ from: event.target.value || null })}
          className="h-7 w-auto text-xs"
        />
        <span className="text-xs text-muted-foreground">{t("to")}</span>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          aria-label={t("createdTo")}
          onChange={(event) => apply({ to: event.target.value || null })}
          className="h-7 w-auto text-xs"
        />
      </FilterGroup>

      {active ? (
        <Button variant="ghost" size="sm" className="h-7" onClick={() => router.push("/contacts")}>
          <XIcon className="size-3.5" />
          {t("clear")}
        </Button>
      ) : null}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
