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
import {
  countryForOrg,
  normalizeDomain,
  normalizePhone,
  normalizeText,
  normalizeWebsite,
} from "@/lib/normalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  companyIdSchema,
  companyIdsSchema,
  createCompanySchema,
  updateCompanySchema,
  type CompanyFormValues,
} from "./schema";

function normalizeCompany(
  values: CompanyFormValues,
  countryCode: ReturnType<typeof countryForOrg>,
) {
  return {
    name: normalizeText(values.name, 200) ?? values.name,
    // Accepts a pasted URL or email address and reduces it to a bare domain,
    // which is what makes domain usable as a dedupe and auto-link key.
    domain: normalizeDomain(values.domain),
    industry: normalizeText(values.industry, 100),
    website: normalizeWebsite(values.website),
    phone: normalizePhone(values.phone, countryCode),
    address_line1: normalizeText(values.addressLine1, 200),
    postal_code: normalizeText(values.postalCode, 20),
    city: normalizeText(values.city, 100),
    country: values.country,
    notes: normalizeText(values.notes, 10000),
    owner_id: values.ownerId,
  };
}

export async function createCompany(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("companies.create", async ({ log }) => {
    const parsed = parseInput(createCompanySchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    // Convenience gate: a clear, translated message instead of a raw
    // constraint error. The database trigger is what actually enforces it.
    const denied = await requireEntitlement(session.organization.id, "write");
    if (denied) return denied;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("companies")
      .insert({
        organization_id: session.organization.id,
        ...normalizeCompany(parsed.data, countryForOrg(session.organization.timezone)),
      })
      .select("id")
      .single();

    if (error || !data) {
      log.warn({ code: error?.code }, "company insert failed");
      return fail(errorKeyForPostgres(error?.code));
    }

    refresh();
    return ok({ id: data.id });
  });
}

export async function updateCompany(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("companies.update", async () => {
    const parsed = parseInput(updateCompanySchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("companies")
      .update(normalizeCompany(parsed.data.data, countryForOrg(session.organization.timezone)), {
        count: "exact",
      })
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(errorKeyForPostgres(error.code));
    if (count === 0) return fail("notFound");

    refresh();
    return ok();
  });
}

export async function deleteCompany(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("companies.delete", async () => {
    const parsed = parseInput(companyIdSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    // Contacts are NOT deleted with the company: the composite FK is
    // ON DELETE SET NULL (company_id), so they survive unlinked. Deleting a
    // company should never silently take a hundred people with it.
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("companies")
      .delete()
      .eq("organization_id", session.organization.id)
      .eq("id", parsed.data.id);

    if (error) return fail(errorKeyForPostgres(error.code));

    refresh();
    return ok();
  });
}

export async function deleteCompanies(input: unknown): Promise<ActionResult<{ deleted: number }>> {
  return runAction("companies.bulkDelete", async ({ log }) => {
    const parsed = parseInput(companyIdsSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase
      .from("companies")
      .delete({ count: "exact" })
      .eq("organization_id", session.organization.id)
      .in("id", parsed.data.ids);

    if (error) return fail(errorKeyForPostgres(error.code));

    log.info({ deleted: count ?? 0 }, "companies bulk deleted");
    refresh();
    return ok({ deleted: count ?? 0 });
  });
}
