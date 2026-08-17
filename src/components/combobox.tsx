"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string };

/**
 * Searchable single-select.
 *
 * A plain `<Select>` is fine for a handful of fixed choices, but the company
 * picker faces hundreds of entries, where scrolling is unusable. This filters
 * as you type and stays keyboard-navigable.
 *
 * Options are passed in whole (capped at 500 by the query) rather than fetched
 * per keystroke — a round trip per character is not worth it at this scale, and
 * it keeps the component free of loading states.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  clearLabel,
  disabled,
  id,
  className,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  /** Shown as the "no selection" entry. Omit to make the field required. */
  clearLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const tCommon = useTranslations("common");
  const selected = options.find((option) => option.value === value) ?? null;

  function select(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-expanded={open}
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent className="w-[--anchor-width] min-w-[16rem] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {clearLabel ? (
                <CommandItem value="__clear__" onSelect={() => select(null)}>
                  <span className="text-muted-foreground">{clearLabel}</span>
                  {value === null ? <CheckIcon className="ml-auto size-4" /> : null}
                </CommandItem>
              ) : null}

              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  // cmdk filters on this string, so it must be the human-
                  // readable label, not the UUID.
                  value={`${option.label} ${option.value}`}
                  onSelect={() => select(option.value)}
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value ? <CheckIcon className="ml-auto size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <span className="sr-only">{tCommon("search")}</span>
      </PopoverContent>
    </Popover>
  );
}
