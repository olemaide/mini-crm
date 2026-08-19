"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";

import { env } from "@/env";
import {
  errorKeyForPostgres,
  fail,
  ok,
  parseInput,
  runAction,
  type ActionResult,
} from "@/lib/actions";
import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_COOKIE_MAX_AGE,
  AFTER_LOGIN_PATH,
} from "@/lib/auth/constants";
import { defaultLeadTaskTitle } from "@/lib/seed/tasks";
import { getMemberships, getSession, isAtLeastAdmin, requireSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  invitationIdSchema,
  inviteMemberSchema,
  memberIdSchema,
  memberRoleSchema,
  switchOrganizationSchema,
  updateOrganizationSchema,
  updateProfileSchema,
} from "./schema";

/**
 * Sets the active-organization cookie.
 *
 * Callers must have already verified membership. The cookie is only a hint —
 * getSession() re-validates it against the membership list on every request —
 * but writing an unverified value would still produce a confusing redirect.
 */
async function setActiveOrganizationCookie(organizationId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}

export async function createOrganization(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("org.create", async ({ log }) => {
    const parsed = parseInput(createOrganizationSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("notAuthenticated");

    // The RPC creates the org, installs the caller as owner and seeds the
    // automation settings atomically. The task title is passed in rather than
    // chosen in SQL so the seed catalogue stays in TypeScript alongside the
    // pipeline stage names — it is stored text in the org's language, never a
    // translation key (§1.5 rule 3).
    const { data, error } = await supabase.rpc("create_organization", {
      p_name: parsed.data.name,
      p_locale: parsed.data.locale,
      p_timezone: parsed.data.timezone,
      p_currency: parsed.data.currency,
      p_lead_task_title: defaultLeadTaskTitle(parsed.data.locale),
    });

    if (error || !data) {
      log.error({ code: error?.code }, "create_organization failed");
      return fail(errorKeyForPostgres(error?.code));
    }

    await setActiveOrganizationCookie(data);
    log.info({ organizationId: data }, "organization created");
    return ok({ id: data });
  });
}

export async function switchOrganization(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("org.switch", async () => {
    const parsed = parseInput(switchOrganizationSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    // Verify membership before trusting the id. RLS would block the data
    // anyway, but an unchecked switch leaves the user on a shell full of
    // empty lists with no explanation.
    const memberships = await getMemberships();
    const target = memberships.find((m) => m.organization.id === parsed.data.organizationId);
    if (!target) return fail("notAuthorized");

    await setActiveOrganizationCookie(target.organization.id);
    refresh();
    return ok();
  });
}

export async function updateOrganization(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("org.update", async () => {
    const parsed = parseInput(updateOrganizationSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");
    if (session.organization.id !== parsed.data.organizationId || !isAtLeastAdmin(session.role)) {
      return fail("notAuthorized");
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: parsed.data.name,
        locale: parsed.data.locale,
        timezone: parsed.data.timezone,
        currency: parsed.data.currency,
      })
      .eq("id", parsed.data.organizationId);

    if (error) return fail(errorKeyForPostgres(error.code));

    refresh();
    return ok();
  });
}

/**
 * Creates an invitation and returns the raw token exactly once.
 *
 * The caller is responsible for showing the resulting link to the admin — it
 * cannot be retrieved later, because only its hash is stored.
 */
export async function inviteMember(input: unknown): Promise<ActionResult<{ token: string }>> {
  return runAction("org.invite", async ({ log }) => {
    const parsed = parseInput(inviteMemberSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");
    if (session.organization.id !== parsed.data.organizationId || !isAtLeastAdmin(session.role)) {
      return fail("notAuthorized");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_invitation", {
      p_organization_id: parsed.data.organizationId,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    });

    if (error) return fail(errorKeyForPostgres(error.code));

    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.token) return fail("unexpected");

    // Never log the token itself — it is a credential.
    log.info({ invitationId: row.invitation_id }, "invitation created");
    refresh();
    return ok({ token: row.token });
  });
}

export async function revokeInvitation(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("org.revokeInvitation", async () => {
    const parsed = parseInput(invitationIdSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");
    if (session.organization.id !== parsed.data.organizationId || !isAtLeastAdmin(session.role)) {
      return fail("notAuthorized");
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", parsed.data.invitationId)
      .eq("organization_id", parsed.data.organizationId)
      .is("accepted_at", null);

    if (error) return fail(errorKeyForPostgres(error.code));

    refresh();
    return ok();
  });
}

export async function acceptInvitation(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("org.acceptInvitation", async () => {
    const parsed = parseInput(acceptInvitationSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("notAuthenticated");

    const { data, error } = await supabase.rpc("accept_invitation", {
      p_token: parsed.data.token,
    });

    if (error || !data) return fail(errorKeyForPostgres(error?.code));

    await setActiveOrganizationCookie(data);
    return ok({ id: data });
  });
}

export async function changeMemberRole(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("org.changeMemberRole", async () => {
    const parsed = parseInput(memberRoleSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");
    if (session.organization.id !== parsed.data.organizationId || !isAtLeastAdmin(session.role)) {
      return fail("notAuthorized");
    }

    const supabase = await createSupabaseServerClient();
    // The database enforces the hard rules on top of this: only an owner may
    // grant or revoke ownership, and the last owner cannot be demoted.
    const { error } = await supabase
      .from("organization_members")
      .update({ role: parsed.data.role })
      .eq("organization_id", parsed.data.organizationId)
      .eq("user_id", parsed.data.userId);

    if (error) return fail(errorKeyForPostgres(error.code));

    refresh();
    return ok();
  });
}

export async function removeMember(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("org.removeMember", async () => {
    const parsed = parseInput(memberIdSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await getSession();
    if (!session) return fail("notAuthenticated");

    const isSelf = parsed.data.userId === session.user.id;
    if (session.organization.id !== parsed.data.organizationId) return fail("notAuthorized");
    if (!isSelf && !isAtLeastAdmin(session.role)) return fail("notAuthorized");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", parsed.data.organizationId)
      .eq("user_id", parsed.data.userId);

    if (error) return fail(errorKeyForPostgres(error.code));

    if (isSelf) {
      const cookieStore = await cookies();
      cookieStore.delete(ACTIVE_ORG_COOKIE);
    }

    refresh();
    return ok();
  });
}

export async function updateProfile(input: unknown): Promise<ActionResult<undefined>> {
  return runAction("profile.update", async () => {
    const parsed = parseInput(updateProfileSchema, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("notAuthenticated");

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName?.trim() || null,
        locale: parsed.data.locale,
      })
      .eq("id", user.id);

    if (error) return fail(errorKeyForPostgres(error.code));

    // Keep the cookie in step so the very next render uses the new language
    // without waiting for a fresh profile read.
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, parsed.data.locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      path: "/",
    });

    refresh();
    return ok();
  });
}

/** Used by the onboarding flow once an organization exists. */
export async function goToDashboard(): Promise<void> {
  await requireSession();
  redirect(AFTER_LOGIN_PATH);
}
