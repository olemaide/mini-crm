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
import { getSession, isAtLeastAdmin } from "@/lib/auth/session";
import { normalizeText } from "@/lib/normalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  automationSettingsSchema,
  createTaskSchema,
  setTaskStatusSchema,
  taskIdSchema,
  updateTaskSchema,
} from "./schema";

function taskErrorKey(code: string | undefined): string {
  switch (code) {
    case "P0005":
      return "assigneeNotMember";
    case "23514":
      // The at-most-one-link or title-length constraint. Zod catches both
      // first, so reaching here means a client bypassed the form.
      return "validation";
    case "23503":
      return "invalidReference";
    default:
      return errorKeyForPostgres(code);
  }
}

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("tasks.create", async ({ log }) => {
    const parsed = parseInput(createTaskSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        organization_id: session.organization.id,
        title: normalizeText(parsed.data.title, 200) ?? parsed.data.title,
        description: parsed.data.description,
        due_at: parsed.data.dueAt,
        priority: parsed.data.priority,
        assignee_id: parsed.data.assigneeId,
        created_by: session.user.id,
        contact_id: parsed.data.contactId,
        company_id: parsed.data.companyId,
        deal_id: parsed.data.dealId,
      })
      .select("id")
      .single();

    if (error || !data) {
      log.warn({ code: error?.code }, "task insert failed");
      return fail(taskErrorKey(error?.code));
    }

    refresh();
    return ok({ id: data.id });
  });
}

export async function updateTask(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("tasks.update", async () => {
    const parsed = parseInput(updateTaskSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("tasks")
      .update(
        {
          title: normalizeText(parsed.data.data.title, 200) ?? parsed.data.data.title,
          description: parsed.data.data.description,
          due_at: parsed.data.data.dueAt,
          priority: parsed.data.data.priority,
          assignee_id: parsed.data.data.assigneeId,
          contact_id: parsed.data.data.contactId,
          company_id: parsed.data.data.companyId,
          deal_id: parsed.data.data.dealId,
        },
        { count: "exact" },
      )
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(taskErrorKey(error.code));
    if (count === 0) return fail("notFound");

    refresh();
    return ok();
  });
}

/**
 * The checkbox, and its undo.
 *
 * Only `status` is written. `completed_at` and the `task_completed` feed entry
 * are both derived by database triggers, so completing from the list, from a
 * record widget or from a future bulk action produces identical bookkeeping.
 */
export async function setTaskStatus(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("tasks.setStatus", async () => {
    const parsed = parseInput(setTaskStatusSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("tasks")
      .update({ status: parsed.data.status }, { count: "exact" })
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(taskErrorKey(error.code));
    if (count === 0) return fail("notFound");

    refresh();
    return ok();
  });
}

export async function deleteTask(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("tasks.delete", async () => {
    const parsed = parseInput(taskIdSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(taskErrorKey(error.code));

    refresh();
    return ok();
  });
}

/**
 * Automation settings.
 *
 * Admin-only, and RLS is what enforces that — the role check here just turns a
 * policy refusal into a clear message instead of a silent zero-row update.
 */
export async function updateAutomationSettings(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("automation.update", async () => {
    const parsed = parseInput(automationSettingsSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");
    if (!isAtLeastAdmin(session.role)) return fail("notAuthorized");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("automation_settings")
      .update(
        {
          lead_task_enabled: parsed.data.leadTaskEnabled,
          // Stored text: written exactly as typed, never re-translated.
          lead_task_title: parsed.data.leadTaskTitle,
          lead_task_offset_days: parsed.data.leadTaskOffsetDays,
        },
        { count: "exact" },
      )
      .eq("organization_id", session.organization.id);

    if (error) return fail(taskErrorKey(error.code));
    if (count === 0) return fail("notFound");

    refresh();
    return ok();
  });
}
