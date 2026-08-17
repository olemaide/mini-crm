/** Cookie holding the active organization id for multi-org users. */
export const ACTIVE_ORG_COOKIE = "minicrm_org";

/** One year. The active org is a preference, not a session value. */
export const ACTIVE_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Where unauthenticated visitors are sent. */
export const LOGIN_PATH = "/login";

/** Where authenticated users without an organization are sent. */
export const ONBOARDING_PATH = "/onboarding";

/** Landing page after a successful sign-in. */
export const AFTER_LOGIN_PATH = "/dashboard";
