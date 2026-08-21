"use server";

import { refresh } from "next/cache";

import { errorKeyForPostgres, fail, ok, runAction, type ActionResult } from "@/lib/actions";
import { isAtLeastAdmin, requireSession } from "@/lib/auth/session";
import { requireEntitlement } from "@/features/billing/entitlements";
import { getOrCreateDefaultPipeline } from "@/features/deals/queries";
import { demoDataset } from "@/lib/seed/demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * "Fill with sample data".
 *
 * Written in TypeScript against the ordinary RLS-scoped client rather than as a
 * `security definer` RPC. That is the whole point: the seeder goes through the
 * same policies, triggers and entitlement checks as a user typing the records in
 * by hand, so the pipeline board, the activity feed and the auto-created
 * follow-up task all end up in exactly the state they would reach naturally.
 * A definer function writing rows directly would produce a tenant that looks
 * seeded — missing feed entries, missing automation — and would also be a new
 * path that bypasses the contact limit.
 *
 * Several round trips is the cost, and it is the right trade for a one-off
 * action behind an explicit button click.
 */
export async function seedDemoData(): Promise<ActionResult<{ contacts: number; deals: number }>> {
  return runAction("dashboard.seedDemoData", async ({ log }) => {
    const session = await requireSession();
    if (!isAtLeastAdmin(session.role)) return fail("notAuthorized");

    const denied = await requireEntitlement(session.organization.id, "write");
    if (denied) return denied;

    const organizationId = session.organization.id;
    const supabase = await createSupabaseServerClient();

    /*
     * Refuse on a workspace that already has data.
     *
     * This is why there is no "remove sample data" counterpart to build: the
     * seeder can only ever run against an empty tenant, so a user who wants it
     * gone deletes five companies and five contacts — or, if they truly want to
     * start over, the records were never real in the first place. Guarding here
     * beats stamping every row with an `is_demo` flag that then has to be
     * carried by six tables and honoured by every query.
     */
    const [{ count: contactCount }, { count: companyCount }, { count: dealCount }] =
      await Promise.all([
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
      ]);

    if ((contactCount ?? 0) > 0 || (companyCount ?? 0) > 0 || (dealCount ?? 0) > 0) {
      return fail("workspaceNotEmpty");
    }

    // Locale of the organization, not of the person clicking: these strings
    // become stored text the whole team reads (§1.5 rule 3).
    const dataset = demoDataset(session.organization.locale);

    const pipelineId = await getOrCreateDefaultPipeline(
      organizationId,
      session.organization.locale,
    );
    if (!pipelineId) return fail("unexpected");

    const { data: stages, error: stagesError } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (stagesError || !stages || stages.length === 0) return fail("unexpected");

    // ------------------------------------------------------------- companies
    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .insert(
        dataset.companies.map((company) => ({
          organization_id: organizationId,
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          city: company.city,
          country: company.country,
          owner_id: session.user.id,
        })),
      )
      .select("id, name");

    if (companyError || !companies) {
      log.error({ code: companyError?.code }, "demo seed failed on companies");
      return fail(errorKeyForPostgres(companyError?.code));
    }

    const companyIdByName = new Map(companies.map((row) => [row.name, row.id]));
    const companyIdByKey = new Map(
      dataset.companies
        .map((company) => [company.key, companyIdByName.get(company.name)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );

    // -------------------------------------------------------------- contacts
    const { data: contacts, error: contactError } = await supabase
      .from("contacts")
      .insert(
        dataset.contacts.map((contact) => ({
          organization_id: organizationId,
          company_id: companyIdByKey.get(contact.companyKey) ?? null,
          first_name: contact.firstName,
          last_name: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          job_title: contact.jobTitle,
          owner_id: session.user.id,
        })),
      )
      .select("id, email");

    if (contactError || !contacts) {
      log.error({ code: contactError?.code }, "demo seed failed on contacts");
      return fail(errorKeyForPostgres(contactError?.code));
    }

    const contactIdByEmail = new Map(
      contacts
        .filter((row): row is typeof row & { email: string } => row.email !== null)
        .map((row) => [row.email.toLowerCase(), row.id]),
    );

    // ----------------------------------------------------------------- deals
    const today = new Date();
    const isoDate = (offsetDays: number) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + offsetDays);
      return date.toISOString().slice(0, 10);
    };

    const { data: deals, error: dealError } = await supabase
      .from("deals")
      .insert(
        dataset.deals.map((deal, index) => ({
          organization_id: organizationId,
          pipeline_id: pipelineId,
          // Clamped, so a shortened stage list cannot produce an undefined id.
          stage_id: stages[Math.min(deal.stageIndex, stages.length - 1)]!.id,
          company_id: companyIdByKey.get(deal.companyKey) ?? null,
          contact_id: contactIdByEmail.get(deal.contactEmail.toLowerCase()) ?? null,
          title: deal.title,
          value_cents: deal.valueCents,
          currency: session.organization.currency,
          expected_close_date: isoDate(deal.expectedCloseInDays),
          owner_id: session.user.id,
          // Gaps of 1000, matching the fractional-index convention from Phase 4.
          position: (index + 1) * 1000,
        })),
      )
      .select("id");

    if (dealError || !deals) {
      log.error({ code: dealError?.code }, "demo seed failed on deals");
      return fail(errorKeyForPostgres(dealError?.code));
    }

    /*
     * Tasks and notes are best-effort from here on.
     *
     * The records that matter are in. If a note insert trips a constraint, a
     * tenant with five companies, five contacts and five deals but one missing
     * note is a far better outcome than an error message and a half-empty
     * workspace the guard above will now refuse to seed again.
     */
    const dueAt = (offsetDays: number) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + offsetDays);
      date.setUTCHours(7, 0, 0, 0);
      return date.toISOString();
    };

    const { error: taskError } = await supabase.from("tasks").insert(
      dataset.tasks.map((task) => ({
        organization_id: organizationId,
        title: task.title,
        due_at: dueAt(task.dueInDays),
        priority: task.priority,
        assignee_id: session.user.id,
        created_by: session.user.id,
        contact_id: task.contactEmail
          ? (contactIdByEmail.get(task.contactEmail.toLowerCase()) ?? null)
          : null,
        company_id: task.companyKey ? (companyIdByKey.get(task.companyKey) ?? null) : null,
      })),
    );
    if (taskError) log.warn({ code: taskError.code }, "demo seed: tasks skipped");

    const { error: noteError } = await supabase.from("activities").insert(
      dataset.notes.map((note) => ({
        organization_id: organizationId,
        type: "note" as const,
        body: note.body,
        // The insert policy requires actor_id to be the caller.
        actor_id: session.user.id,
        contact_id: note.contactEmail
          ? (contactIdByEmail.get(note.contactEmail.toLowerCase()) ?? null)
          : null,
        company_id: note.companyKey ? (companyIdByKey.get(note.companyKey) ?? null) : null,
      })),
    );
    if (noteError) log.warn({ code: noteError.code }, "demo seed: notes skipped");

    log.info(
      { organizationId, contacts: contacts.length, deals: deals.length },
      "demo data seeded",
    );

    refresh();
    return ok({ contacts: contacts.length, deals: deals.length });
  });
}
