/**
 * Locale configuration.
 *
 * English is the default UI language; German is a full second locale (see the
 * build plan, §1.5). Authenticated app routes carry no locale prefix — the
 * active locale comes from a cookie that is seeded from `profiles.locale` at
 * login. Marketing routes will be locale-prefixed for SEO when they land.
 */

export const locales = ["en", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie holding the visitor's active locale. */
export const LOCALE_COOKIE = "minicrm_locale";

/** One year — the locale is a durable preference, not a session value. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Fallback timezone used before an organization is loaded. Timestamps are
 * always stored as UTC; this only affects rendering.
 */
export const defaultTimeZone = "Europe/Berlin";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Display names for the locale switcher, each written in its own language. */
export const localeLabels: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};
