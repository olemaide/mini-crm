"use server";

import { z } from "zod";

import { fail, ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/rate-limit";
import { globalSearch, type SearchResult } from "./queries";

const searchSchema = z.object({
  query: z.string().max(200),
});

/**
 * Search on behalf of the signed-in user's active organization.
 *
 * The organization id is taken from the session and never from the client. The
 * RPC is RLS-scoped anyway, so passing one would buy an attacker nothing — but
 * not accepting it means there is no parameter to reason about.
 */
export async function searchEverything(input: unknown): Promise<ActionResult<SearchResult>> {
  return runAction("search.global", async () => {
    const parsed = parseInput(searchSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    /*
     * Per user, not per organization. Search runs trigram scans over the whole
     * tenant, so it is the cheapest way for one signed-in account to make the
     * database expensive for everyone — but a shared budget would let one
     * colleague's ⌘K habit lock out the rest of the team.
     */
    const limit = await consumeRateLimit("search.global", session.user.id);
    if (!limit.allowed) return fail("rateLimited");

    const result = await globalSearch(session.organization.id, parsed.data.query);
    return ok(result);
  });
}
