import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, defaultTimeZone, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Resolves the locale for the current request.
 *
 * No `[locale]` URL segment is used for app routes, so the cookie is the single
 * source of truth. `cookies()` is async in Next.js 16.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Replaced with the organization's timezone once an org is in scope.
    timeZone: defaultTimeZone,
  };
});
