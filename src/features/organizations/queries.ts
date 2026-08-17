import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/auth/session";

export type MemberRow = {
  userId: string;
  role: OrgRole;
  joinedAt: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: OrgRole;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
};

/**
 * Members of an organization.
 *
 * No organization_id filter is needed for safety — RLS restricts the table to
 * orgs the caller belongs to — but it is required for correctness once a user
 * belongs to more than one.
 *
 * Email lives in auth.users, which is not readable through PostgREST, so the
 * list shows names only. Surfacing teammate emails would need a view with an
 * explicit security barrier; that is not needed for Phase 1.
 */
export async function getOrganizationMembers(organizationId: string): Promise<MemberRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role, created_at, profile:profiles(full_name, avatar_url)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    userId: row.user_id,
    role: row.role,
    joinedAt: row.created_at,
    fullName: row.profile?.full_name ?? null,
    avatarUrl: row.profile?.avatar_url ?? null,
  }));
}

/** Pending invitations. Admin-only by RLS; members get an empty list. */
export async function getPendingInvitations(organizationId: string): Promise<InvitationRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, created_at, expires_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const now = Date.now();
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isExpired: new Date(row.expires_at).getTime() <= now,
  }));
}
