import "server-only";

import type { ZodType } from "zod";

import { createRequestLogger, type RequestLogger } from "@/lib/logger";

/**
 * Server Action conventions (build plan §3 rule 3).
 *
 * Every mutation returns a typed result instead of throwing across the
 * server/client boundary. Errors carry a translation **key**, never a rendered
 * sentence — the same rule as system-generated feed entries: the message is
 * composed in the viewer's locale at render time, not frozen at creation.
 */

export type ActionError = {
  /** Key inside the `errors.action` message namespace. */
  key: string;
  /** Field-level messages from Zod, keyed by field name. */
  fieldErrors?: Record<string, string[]>;
  /** Correlates a user's report with the server log line. */
  requestId?: string;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(key: string, extra: Omit<ActionError, "key"> = {}): ActionResult<never> {
  return { ok: false, error: { key, ...extra } };
}

/**
 * `redirect()` and `notFound()` signal control flow by throwing. Swallowing
 * them in a catch block turns a working redirect into a silent no-op, which is
 * a genuinely baffling bug to track down — so they are always re-thrown.
 */
function isNextControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

/**
 * Maps Postgres/Supabase error codes onto message keys.
 *
 * Anything unmapped becomes a generic message. Raw database text is never
 * shown to a user: it leaks schema details and is untranslated by definition.
 */
const PG_ERROR_KEYS: Record<string, string> = {
  P0001: "lastOwner",
  P0002: "invitationInvalid",
  P0003: "invitationWrongEmail",
  P0004: "alreadyMember",
  // Raised by request_organization_deletion() when the typed confirmation does
  // not match the organization's name.
  P0008: "orgNameMismatch",
  "42501": "notAuthorized",
  "23505": "duplicate",
  "23503": "referenceMissing",
  "22023": "validation",
};

export function errorKeyForPostgres(code: string | undefined): string {
  if (!code) return "unexpected";
  return PG_ERROR_KEYS[code] ?? "unexpected";
}

/**
 * Wraps an action body with logging and error normalisation.
 *
 * With Sentry deferred (build plan §1.4), the request id emitted here is the
 * only link between "a customer says it broke" and a line in the server log.
 */
export async function runAction<T>(
  name: string,
  fn: (ctx: { log: RequestLogger }) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const { log, requestId } = createRequestLogger({ action: name });

  try {
    const result = await fn({ log });
    if (!result.ok) {
      log.warn({ errorKey: result.error.key }, "action rejected");
      return { ok: false, error: { ...result.error, requestId } };
    }
    return result;
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    log.error({ err: error }, "action threw");
    return fail("unexpected", { requestId });
  }
}

/** Validates input, returning field errors in the shape forms expect. */
export function parseInput<T>(
  schema: ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; error: ActionError } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "_form";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return { ok: false, error: { key: "validation", fieldErrors } };
}
