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
import { requireEntitlement } from "@/features/billing/entitlements";
import { getSession } from "@/lib/auth/session";
import { normalizeEmail, normalizeName, normalizePhone, normalizeText } from "@/lib/normalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bulkAssignOwnerSchema,
  contactIdSchema,
  contactIdsSchema,
  createContactSchema,
  updateContactSchema,
  type ContactFormValues,
} from "./schema";

/**
 * Applies the shared normalisers before anything reaches the database.
 *
 * Doing this server-side rather than in the form is the point: the CSV importer
 * and any future API both write through these same functions, so a contact
 * created by import is byte-identical to one typed by hand. Normalising only in
 * the form would let the other paths produce near-duplicates.
 */
function normalizeContact(values: ContactFormValues, countryCode: string) {
  return {
    first_name: normalizeName(values.firstName),
    last_name: normalizeName(values.lastName),
    email: normalizeEmail(values.email),
    phone: normalizePhone(values.phone, countryCode as Parameters<typeof normalizePhone>[1]),
    job_title: normalizeText(values.jobTitle, 150),
    linkedin_url: normalizeText(values.linkedinUrl, 500),
    notes: normalizeText(values.notes, 10000),
    company_id: values.companyId,
    owner_id: values.ownerId,
  };
}

/**
 * The organization's country drives national-format phone parsing. Timezone is
 * the only country-ish signal on the org today, so it stands in until an
 * explicit country field exists.
 */
function countryForOrg(timezone: string): string {
  if (timezone === "Europe/Vienna") return "AT";
  if (timezone === "Europe/Zurich") return "CH";
  if (timezone === "Europe/London") return "GB";
  return "DE";
}

export async function createContact(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("contacts.create", async ({ log }) => {
    const parsed = parseInput(createContactSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    // Convenience gate: a clear, translated message instead of a raw
    // constraint error. The database trigger is what actually enforces it.
    const denied = await requireEntitlement(session.organization.id, "unlimited_contacts");
    if (denied) return denied;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: session.organization.id,
        source: "manual",
        ...normalizeContact(parsed.data, countryForOrg(session.organization.timezone)),
      })
      .select("id")
      .single();

    if (error || !data) {
      // 23505 on contacts_org_email_uniq is the common case and deserves a
      // specific message rather than "something went wrong".
      if (error?.code === "23505") return fail("contactEmailTaken");
      log.warn({ code: error?.code }, "contact insert failed");
      return fail(errorKeyForPostgres(error?.code));
    }

    refresh();
    return ok({ id: data.id });
  });
}

export async function updateContact(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("contacts.update", async ({ log }) => {
    const parsed = parseInput(updateContactSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("contacts")
      .update(normalizeContact(parsed.data.data, countryForOrg(session.organization.timezone)), {
        count: "exact",
      })
      // RLS already scopes this, but the explicit organization_id also stops a
      // valid id from another of the user's own orgs being edited from the
      // wrong context.
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) {
      if (error.code === "23505") return fail("contactEmailTaken");
      log.warn({ code: error.code }, "contact update failed");
      return fail(errorKeyForPostgres(error.code));
    }
    if (count === 0) return fail("notFound");

    refresh();
    return ok();
  });
}

export async function deleteContact(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("contacts.delete", async () => {
    const parsed = parseInput(contactIdSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(errorKeyForPostgres(error.code));

    refresh();
    return ok();
  });
}

export async function deleteContacts(input: unknown): Promise<ActionResult<{ deleted: number }>> {
  return runAction("contacts.bulkDelete", async ({ log }) => {
    const parsed = parseInput(contactIdsSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("contacts")
      .delete({ count: "exact" })
      .eq("organization_id", session.organization.id)
      .in("id", parsed.data.ids);

    if (error) return fail(errorKeyForPostgres(error.code));

    log.info({ deleted: count ?? 0 }, "contacts bulk deleted");
    refresh();
    return ok({ deleted: count ?? 0 });
  });
}

export async function assignContactOwner(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  return runAction("contacts.bulkAssignOwner", async () => {
    const parsed = parseInput(bulkAssignOwnerSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    // The database trigger enforces this too; checking here produces a useful
    // message instead of a raw P0005.
    if (
      parsed.data.ownerId &&
      !session.memberships.some((m) => m.organization.id === session.organization.id)
    ) {
      return fail("notAuthorized");
    }

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("contacts")
      .update({ owner_id: parsed.data.ownerId }, { count: "exact" })
      .eq("organization_id", session.organization.id)
      .in("id", parsed.data.ids);

    if (error) {
      if (error.code === "P0005") return fail("ownerNotMember");
      return fail(errorKeyForPostgres(error.code));
    }

    refresh();
    return ok({ updated: count ?? 0 });
  });
}
