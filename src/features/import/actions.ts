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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createImportJobSchema,
  finalizeJobSchema,
  jobIdSchema,
  previewDuplicatesSchema,
} from "./schema";

/** Maps the import-specific SQLSTATEs onto message keys. */
function importErrorKey(code: string | undefined): string {
  switch (code) {
    case "P0006":
      return "tooManyImports";
    case "P0007":
      return "importNotRunning";
    case "P0002":
      return "importNotFound";
    default:
      return errorKeyForPostgres(code);
  }
}

export async function createImportJob(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return runAction("import.create", async ({ log }) => {
    const parsed = parseInput(createImportJobSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_import_job", {
      p_organization_id: session.organization.id,
      p_filename: parsed.data.filename,
      p_total_rows: parsed.data.totalRows,
      p_duplicate_policy: parsed.data.duplicatePolicy,
      p_create_companies: parsed.data.createCompanies,
      p_mapping: parsed.data.mapping,
    });

    if (error || !data) {
      log.warn({ code: error?.code }, "create_import_job failed");
      return fail(importErrorKey(error?.code));
    }

    log.info({ jobId: data, rows: parsed.data.totalRows }, "import started");
    return ok({ jobId: data });
  });
}

export async function finalizeImportJob(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("import.finalize", async () => {
    const parsed = parseInput(finalizeJobSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("finalize_import_job", {
      p_job_id: parsed.data.jobId,
      p_status: parsed.data.status,
    });

    if (error) return fail(importErrorKey(error.code));

    refresh();
    return ok();
  });
}

export async function undoImportJob(
  input: unknown,
): Promise<ActionResult<{ contactsDeleted: number; companiesDeleted: number }>> {
  return runAction("import.undo", async ({ log }) => {
    const parsed = parseInput(jobIdSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("undo_import_job", {
      p_job_id: parsed.data.jobId,
    });

    if (error || !data) return fail(importErrorKey(error?.code));

    const result = data as { contacts_deleted: number; companies_deleted: number };
    log.info({ jobId: parsed.data.jobId, ...result }, "import undone");

    refresh();
    return ok({
      contactsDeleted: result.contacts_deleted ?? 0,
      companiesDeleted: result.companies_deleted ?? 0,
    });
  });
}

/**
 * How many rows in the pending file already exist. Called once from the preview
 * step so the user chooses a duplicate policy with a real number in front of
 * them rather than a guess.
 */
export async function previewDuplicates(
  input: unknown,
): Promise<ActionResult<{ emailMatches: number; phoneMatches: number; sample: string[] }>> {
  return runAction("import.previewDuplicates", async () => {
    const parsed = parseInput(previewDuplicatesSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("preview_import_duplicates", {
      p_organization_id: session.organization.id,
      p_emails: parsed.data.emails,
      p_phones: parsed.data.phones,
    });

    if (error || !data) return fail(importErrorKey(error?.code));

    const result = data as { email_matches: number; phone_matches: number; sample: string[] };
    return ok({
      emailMatches: result.email_matches ?? 0,
      phoneMatches: result.phone_matches ?? 0,
      sample: result.sample ?? [],
    });
  });
}
