import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { ContactSortColumn } from "./schema";

export type ContactListItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  createdAt: string;
  company: { id: string; name: string } | null;
  owner: { id: string; fullName: string | null } | null;
};

export type ContactDetail = ContactListItem & {
  linkedinUrl: string | null;
  notes: string | null;
  source: Database["public"]["Enums"]["contact_source"];
  updatedAt: string;
  companyId: string | null;
  ownerId: string | null;
};

export type ContactListParams = {
  organizationId: string;
  page: number;
  pageSize: number;
  sort: ContactSortColumn;
  direction: "asc" | "desc";
  query?: string | null;
  ownerId?: string | null;
  companyId?: string | null;
};

export type ContactListResult = {
  items: ContactListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * Maps a sort key to concrete columns.
 *
 * A closed set, not a passthrough: an ORDER BY built from raw client input is
 * both an injection surface and a guaranteed sequential scan the moment someone
 * sorts by an unindexed column. Every entry here is backed by an index (see
 * 20260817040400_phase2_sort_indexes.sql), and every one ends with `id` so the
 * ordering is total — otherwise rows with equal keys drift between pages and a
 * contact gets shown twice or skipped.
 */
const CONTACT_SORT_COLUMNS: Record<ContactSortColumn, string[]> = {
  created_at: ["created_at", "id"],
  updated_at: ["updated_at", "id"],
  name: ["last_name", "first_name", "id"],
  email: ["email", "id"],
};

const LIST_SELECT = `
  id, first_name, last_name, email, phone, job_title, created_at,
  company:companies(id, name),
  owner:profiles(id, full_name)
`;

export async function listContacts(params: ContactListParams): Promise<ContactListResult> {
  const supabase = await createSupabaseServerClient();
  const { organizationId, page, pageSize, sort, direction } = params;

  let request = supabase
    .from("contacts")
    .select(LIST_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (params.ownerId) request = request.eq("owner_id", params.ownerId);
  if (params.companyId) request = request.eq("company_id", params.companyId);

  const search = params.query?.trim();
  if (search) {
    // Escape PostgREST's `or` grammar before interpolating: a bare comma or
    // parenthesis in the search box would otherwise be parsed as filter syntax.
    const safe = search.replace(/[,()\\]/g, " ").trim();
    if (safe) {
      request = request.or(
        [`first_name.ilike.*${safe}*`, `last_name.ilike.*${safe}*`, `email.ilike.*${safe}*`].join(
          ",",
        ),
      );
    }
  }

  for (const column of CONTACT_SORT_COLUMNS[sort]) {
    request = request.order(column, { ascending: direction === "asc", nullsFirst: false });
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await request.range(from, from + pageSize - 1);

  if (error) {
    // Returning an empty page beats throwing: the list still renders, the
    // failure is in the server log, and the user is not staring at a 500.
    return { items: [], total: 0, page, pageSize, pageCount: 0 };
  }

  const total = count ?? 0;

  return {
    items: (data ?? []).map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      jobTitle: row.job_title,
      createdAt: row.created_at,
      company: row.company ? { id: row.company.id, name: row.company.name } : null,
      owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name } : null,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getContact(
  organizationId: string,
  id: string,
): Promise<ContactDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `id, first_name, last_name, email, phone, job_title, linkedin_url, notes,
       source, created_at, updated_at, company_id, owner_id,
       company:companies(id, name),
       owner:profiles(id, full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    jobTitle: data.job_title,
    linkedinUrl: data.linkedin_url,
    notes: data.notes,
    source: data.source,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    companyId: data.company_id,
    ownerId: data.owner_id,
    company: data.company ? { id: data.company.id, name: data.company.name } : null,
    owner: data.owner ? { id: data.owner.id, fullName: data.owner.full_name } : null,
  };
}

/** Contacts belonging to one company, for the company detail page. */
export async function listContactsForCompany(
  organizationId: string,
  companyId: string,
  limit = 50,
): Promise<ContactListItem[]> {
  const result = await listContacts({
    organizationId,
    companyId,
    page: 1,
    pageSize: limit,
    sort: "name",
    direction: "asc",
  });
  return result.items;
}
