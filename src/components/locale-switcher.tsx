"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, LanguagesIcon } from "lucide-react";

import { setLocale } from "@/i18n/actions";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LocaleSwitcher() {
  const activeLocale = useLocale() as Locale;
  const t = useTranslations("locale");
  const [isPending, startTransition] = useTransition();

  function onSelect(locale: Locale) {
    if (locale === activeLocale) return;
    startTransition(() => {
      void setLocale(locale);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            aria-label={t("change")}
            className="gap-2"
          />
        }
      >
        <LanguagesIcon className="size-4" />
        <span className="hidden sm:inline">{localeLabels[activeLocale]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => onSelect(locale)}
            className="justify-between gap-6"
          >
            {localeLabels[locale]}
            {locale === activeLocale ? <CheckIcon className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
