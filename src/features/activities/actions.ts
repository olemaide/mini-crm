"use server";

/**
 * None of these actions call `refresh()`, which is a deliberate exception to
 * build-plan §3 rule 3.
 *
 * The feed is an infinitely scrolled client list. Re-rendering the route hands
 * back a fresh first page and silently discards every page the reader had
 * already loaded, so a delete three screens down would yank them back to the
 * top. The client patches its own list instead — which is why `updateActivity`
 * returns the new `edited_at` rather than nothing.
 */

import {
  errorKeyForPostgres,
  fail,
  ok,
  parseInput,
  runAction,
  type ActionResult,
} from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActivityFeed } from "./queries";
import {
  createActivitySchema,
  deleteActivitySchema,
  loadFeedSchema,
  updateActivitySchema,
} from "./schema";
import { Constants } from "@/types/database";
import { typesForFilter, type FeedPage } from "./types";

function activityErrorKey(code: string | undefined): string {
  switch (code) {
    case "23514":
      // A check constraint refused it — an empty note, or a subject count
      // other than one. Both are client bugs, not user mistakes.
      return "validation";
    case "23503":
      return "invalidReference";
    default:
      return errorKeyForPostgres(code);
  }
}

export async function createActivity(input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction("activities.create", async ({ log }) => {
    const parsed = parseInput(createActivitySchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();

    // Exactly one subject column is set; the others stay null. The database
    // enforces that with a check constraint, which is what lets the feed's
    // union skip de-duplication.
    const { data, error } = await supabase
      .from("activities")
      .insert({
        organization_id: session.organization.id,
        type: parsed.data.type,
        contact_id: parsed.data.subjectKind === "contact" ? parsed.data.subjectId : null,
        company_id: parsed.data.subjectKind === "company" ? parsed.data.subjectId : null,
        deal_id: parsed.data.subjectKind === "deal" ? parsed.data.subjectId : null,
        actor_id: session.user.id,
        body: parsed.data.body,
        ...(parsed.data.occurredAt ? { occurred_at: parsed.data.occurredAt } : {}),
      })
      .select("id")
      .single();

    if (error || !data) {
      log.warn({ code: error?.code }, "activity insert failed");
      return fail(activityErrorKey(error?.code));
    }

    return ok({ id: data.id });
  });
}

/**
 * Edits an entry's text or timestamp.
 *
 * Author-only, enforced by RLS rather than by a check here — an ownership test
 * in application code is one refactor away from being dropped. A `count` of
 * zero means the policy refused the row, which is deliberately indistinguishable
 * from the row not existing.
 */
export async function updateActivity(
  input: unknown,
): Promise<ActionResult<{ editedAt: string | null }>> {
  return runAction("activities.update", async () => {
    const parsed = parseInput(updateActivitySchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    // `edited_at` is stamped by a trigger, and only once the entry is older
    // than the grace period — so the client cannot predict it and has to be
    // told whether the "(edited)" marker now applies.
    const { data, error } = await supabase
      .from("activities")
      .update({
        body: parsed.data.body,
        ...(parsed.data.occurredAt ? { occurred_at: parsed.data.occurredAt } : {}),
      })
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id)
      .select("edited_at")
      .maybeSingle();

    if (error) return fail(activityErrorKey(error.code));
    // The row exists but the policy refused it, or it is gone. Both look the
    // same to a client on purpose.
    if (!data) return fail("notFound");

    return ok({ editedAt: data.edited_at });
  });
}

export async function deleteActivity(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("activities.delete", async () => {
    const parsed = parseInput(deleteActivitySchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("activities")
      .delete({ count: "exact" })
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(activityErrorKey(error.code));
    // System rows have no delete policy at all, so this is also what an
    // attempt to erase a stage change looks like.
    if (count === 0) return fail("notFound");

    return ok();
  });
}

/**
 * Fetches the next page for the infinite scroll.
 *
 * A Server Action rather than a route handler: it reuses the request's session
 * and RLS context with no extra plumbing, and there is no client cache to go
 * stale after someone posts a note.
 */
export async function loadMoreActivities(input: unknown): Promise<ActionResult<FeedPage>> {
  return runAction("activities.loadMore", async () => {
    const parsed = parseInput(loadFeedSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const page = await getActivityFeed(parsed.data.subjectKind, parsed.data.subjectId, {
      types: typesForFilter(parsed.data.filter, Constants.public.Enums.activity_type),
      cursor: parsed.data.cursor,
    });

    return ok(page);
  });
}
