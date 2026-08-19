import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { getSession } from "@/lib/auth/session";
import { defaultLocale, defaultTimeZone, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Resolves the locale and timezone for the current request.
 *
 * No `[locale]` URL segment is used for app routes, so the cookie is the single
 * source of truth for language. `cookies()` is async in Next.js 16.
 *
 * The timezone comes from the active organization, because "which day did this
 * happen on" is a property of the business, not of whichever airport its sales
 * rep is sitting in. Every day boundary in the app — the activity feed's
 * Today/Yesterday headers, and task due dates in Phase 6 — depends on getting
 * this right. `getSession()` is `cache()`d and the app layout calls it anyway,
 * so this adds no query on a signed-in page, and it fails soft to the default
 * so an auth hiccup can never break rendering outright.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  let timeZone = defaultTimeZone;
  try {
    const session = await getSession();
    if (session?.organization.timezone) timeZone = session.organization.timezone;
  } catch {
    // Signed-out routes and static generation have no session. The default is
    // the correct answer there, not an error.
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone,
  };
});
