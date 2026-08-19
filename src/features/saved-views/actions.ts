"use server";

import { refresh } from "next/cache";
import { z } from "zod";

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
import { SAVED_VIEW_RESOURCES } from "./queries";

const saveSchema = z.object({
  resource: z.enum(SAVED_VIEW_RESOURCES),
  name: z.string().trim().min(1, { message: "required" }).max(60, { message: "tooLong" }),
  /*
   * The current query string, without the leading '?'.
   *
   * Stored verbatim and replayed as a navigation. That is safe because it is
   * parsed on the way back in by exactly the same hostile-input handling as a
   * hand-typed URL — sort keys checked against an allow-list, page size clamped,
   * uuids validated. A tampered value can only produce a differently filtered
   * list of rows this user can already see.
   */
  queryString: z.string().max(2000),
});

const idSchema = z.object({ id: z.uuid() });

export async function saveView(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("savedViews.save", async () => {
    const parsed = parseInput(saveSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    // Saving under an existing name overwrites it, which is what "save" means
    // when the name is the identifier the user chose.
    const { data, error } = await supabase
      .from("saved_views")
      .upsert(
        {
          organization_id: session.organization.id,
          user_id: session.user.id,
          resource: parsed.data.resource,
          name: parsed.data.name,
          query_string: parsed.data.queryString.replace(/^\?/, ""),
        },
        { onConflict: "user_id,resource,name" },
      )
      .select("id")
      .single();

    if (error || !data) return fail(errorKeyForPostgres(error?.code));

    refresh();
    return ok({ id: data.id });
  });
}

export async function deleteView(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("savedViews.delete", async () => {
    const parsed = parseInput(idSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("saved_views")
      .delete()
      .eq("id", parsed.data.id)
      .eq("user_id", session.user.id);

    if (error) return fail(errorKeyForPostgres(error.code));

    refresh();
    return ok();
  });
}
