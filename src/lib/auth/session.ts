import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { ACTIVE_ORG_COOKIE, LOGIN_PATH, ONBOARDING_PATH } from "./constants";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export type Organization = {
  id: string;
  name: string;
  slug: string;
  locale: string;
  timezone: string;
  currency: string;
};

export type Membership = {
  role: OrgRole;
  organization: Organization;
};

export type AppSession = {
  user: User;
  profile: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
    locale: string;
    defaultOrganizationId: string | null;
  } | null;
  memberships: Membership[];
  organization: Organization;
  role: OrgRole;
};

/**
 * `cache()` dedupes within a single render pass. A layout, its page and three
 * components can each ask for the session and the database is queried once.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createSupabaseServerClient();
  // RLS lets a member read every row of an org they belong to, so the
  // user_id filter is doing real work here, not just optimising.
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(id, name, slug, locale, timezone, currency)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data
    .filter((row): row is typeof row & { organization: Organization } => row.organization !== null)
    .map((row) => ({ role: row.role, organization: row.organization }));
});

/**
 * Resolves the full session: user, profile, memberships and the active org.
 *
 * Active-organization precedence:
 *   1. the `minicrm_org` cookie, **only if** the user is actually a member
 *   2. the profile's default organization, same check
 *   3. the first membership
 *
 * Step 1 is the security-relevant one. The cookie is client-controlled, so it
 * is treated as a hint and re-validated against the membership list on every
 * request. RLS would block a forged value anyway, but failing here produces a
 * clean redirect instead of a page full of empty queries.
 */
export const getSession = cache(async (): Promise<AppSession | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: profileRow }, memberships] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, locale, default_organization_id")
      .eq("id", user.id)
      .maybeSingle(),
    getMemberships(),
  ]);

  const profile = profileRow
    ? {
        id: profileRow.id,
        fullName: profileRow.full_name,
        avatarUrl: profileRow.avatar_url,
        locale: profileRow.locale,
        defaultOrganizationId: profileRow.default_organization_id,
      }
    : null;

  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  const active =
    memberships.find((m) => m.organization.id === requestedOrgId) ??
    memberships.find((m) => m.organization.id === profile?.defaultOrganizationId) ??
    memberships[0];

  if (!active) return null;

  return {
    user,
    profile,
    memberships,
    organization: active.organization,
    role: active.role,
  };
});

/**
 * Session or redirect. Use in the `(app)` layout and any Server Action that
 * touches tenant data.
 */
export async function requireSession(): Promise<AppSession> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);

  const session = await getSession();
  // Authenticated but belonging to no organization: send them to create one
  // rather than rendering an app shell with nothing in it.
  if (!session) redirect(ONBOARDING_PATH);

  return session;
}

export function isAtLeastAdmin(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}
