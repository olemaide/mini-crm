"use server";

import { refresh } from "next/cache";

import {
  errorKeyForPostgres,
  fail,
  ok,
  parseInput,
  runAction,
  type ActionResult,
} from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeText } from "@/lib/normalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDealSchema,
  dealIdSchema,
  deleteStageSchema,
  moveDealSchema,
  reorderStageSchema,
  setLostReasonSchema,
  stageFormSchema,
  updateDealSchema,
  updateStageSchema,
} from "./schema";

function dealErrorKey(code: string | undefined): string {
  switch (code) {
    case "23503":
      // A composite FK rejected the stage, contact or company — always a
      // cross-pipeline or cross-tenant reference.
      return "invalidReference";
    case "P0005":
      return "ownerNotMember";
    default:
      return errorKeyForPostgres(code);
  }
}

export async function createDeal(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("deals.create", async ({ log }) => {
    const parsed = parseInput(createDealSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const cents = parsed.data.value === null ? 0 : parseMoneyToCents(parsed.data.value);
    if (cents === null) return fail("invalidAmount");
    if (cents < 0) return fail("invalidAmount");

    const supabase = await createSupabaseServerClient();

    // New cards go to the top of their column: a deal you just created is the
    // one you are about to act on.
    const { data: top } = await supabase
      .from("deals")
      .select("position")
      .eq("organization_id", session.organization.id)
      .eq("stage_id", parsed.data.stageId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    const position = top ? Number(top.position) - 1000 : 1000;

    const { data, error } = await supabase
      .from("deals")
      .insert({
        organization_id: session.organization.id,
        pipeline_id: parsed.data.pipelineId,
        stage_id: parsed.data.stageId,
        title: normalizeText(parsed.data.title, 200) ?? parsed.data.title,
        value_cents: cents,
        currency: session.organization.currency,
        contact_id: parsed.data.contactId,
        company_id: parsed.data.companyId,
        owner_id: parsed.data.ownerId,
        expected_close_date: parsed.data.expectedCloseDate,
        position,
      })
      .select("id")
      .single();

    if (error || !data) {
      log.warn({ code: error?.code }, "deal insert failed");
      return fail(dealErrorKey(error?.code));
    }

    refresh();
    return ok({ id: data.id });
  });
}

export async function updateDeal(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("deals.update", async () => {
    const parsed = parseInput(updateDealSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const cents = parsed.data.data.value === null ? 0 : parseMoneyToCents(parsed.data.data.value);
    if (cents === null || cents < 0) return fail("invalidAmount");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("deals")
      .update(
        {
          title: normalizeText(parsed.data.data.title, 200) ?? parsed.data.data.title,
          value_cents: cents,
          stage_id: parsed.data.data.stageId,
          contact_id: parsed.data.data.contactId,
          company_id: parsed.data.data.companyId,
          owner_id: parsed.data.data.ownerId,
          expected_close_date: parsed.data.data.expectedCloseDate,
        },
        { count: "exact" },
      )
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(dealErrorKey(error.code));
    if (count === 0) return fail("notFound");

    refresh();
    return ok();
  });
}

/**
 * A drag, or a keyboard "move to stage".
 *
 * Only stage and position are written. Status, closing date and the history row
 * are all derived by database triggers from the target stage's is_won/is_lost
 * flags, so every path that moves a card — board, detail page, future
 * automation — produces identical bookkeeping.
 */
export async function moveDeal(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("deals.move", async () => {
    const parsed = parseInput(moveDealSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("deals")
      .update(
        {
          stage_id: parsed.data.stageId,
          position: parsed.data.position,
          ...(parsed.data.lostReason !== null ? { lost_reason: parsed.data.lostReason } : {}),
        },
        { count: "exact" },
      )
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(dealErrorKey(error.code));
    if (count === 0) return fail("notFound");

    refresh();
    return ok();
  });
}

export async function setLostReason(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("deals.setLostReason", async () => {
    const parsed = parseInput(setLostReasonSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("deals")
      .update({ lost_reason: parsed.data.lostReason })
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id)
      .eq("status", "lost");

    if (error) return fail(dealErrorKey(error.code));

    refresh();
    return ok();
  });
}

export async function deleteDeal(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("deals.delete", async () => {
    const parsed = parseInput(dealIdSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("deals")
      .delete()
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(dealErrorKey(error.code));

    refresh();
    return ok();
  });
}

// ---------------------------------------------------------------- stages

export async function createStage(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("stages.create", async () => {
    const parsed = parseInput(stageFormSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();

    // New stages land before the terminal Won/Lost columns, which is almost
    // always where a new step in the process belongs.
    const { data: terminal } = await supabase
      .from("pipeline_stages")
      .select("position")
      .eq("organization_id", session.organization.id)
      .eq("pipeline_id", parsed.data.pipelineId)
      .or("is_won.eq.true,is_lost.eq.true")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: last } = await supabase
      .from("pipeline_stages")
      .select("position")
      .eq("organization_id", session.organization.id)
      .eq("pipeline_id", parsed.data.pipelineId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const position = terminal
      ? Number(terminal.position) - 500
      : Number(last?.position ?? 0) + 1000;

    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        organization_id: session.organization.id,
        pipeline_id: parsed.data.pipelineId,
        name: parsed.data.name,
        probability: parsed.data.probability,
        position,
      })
      .select("id")
      .single();

    if (error || !data) return fail(dealErrorKey(error?.code));

    refresh();
    return ok({ id: data.id });
  });
}

export async function updateStage(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("stages.update", async () => {
    const parsed = parseInput(updateStageSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("pipeline_stages")
      .update({ name: parsed.data.name, probability: parsed.data.probability })
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(dealErrorKey(error.code));

    refresh();
    return ok();
  });
}

export async function reorderStage(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("stages.reorder", async () => {
    const parsed = parseInput(reorderStageSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("pipeline_stages")
      .update({ position: parsed.data.position })
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(dealErrorKey(error.code));

    refresh();
    return ok();
  });
}

/**
 * Deletes a stage after moving its deals elsewhere.
 *
 * The reassignment target is mandatory. A stage delete that took its deals with
 * it would destroy real pipeline value on a misclick, and the composite foreign
 * key would refuse the delete anyway — better to make the intent explicit than
 * to surface a constraint error.
 */
export async function deleteStage(input: unknown): Promise<ActionResult<{ moved: number }>> {
  return runAction("stages.delete", async () => {
    const parsed = parseInput(deleteStageSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.data.id === parsed.data.moveDealsToStageId) return fail("validation");

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();

    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("is_won, is_lost")
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (!stage) return fail("notFound");
    // Removing the terminal columns would leave nowhere to close a deal and no
    // way for the triggers to derive won/lost.
    if (stage.is_won || stage.is_lost) return fail("cannotDeleteTerminalStage");

    const { error: moveError, count } = await supabase
      .from("deals")
      .update({ stage_id: parsed.data.moveDealsToStageId }, { count: "exact" })
      .eq("organization_id", session.organization.id)
      .eq("stage_id", parsed.data.id);

    if (moveError) return fail(dealErrorKey(moveError.code));

    const { error } = await supabase
      .from("pipeline_stages")
      .delete()
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(dealErrorKey(error.code));

    refresh();
    return ok({ moved: count ?? 0 });
  });
}
