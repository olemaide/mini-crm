import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CompanySortColumn } from "./schema";

export type CompanyListItem = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  contactCount: number;
  owner: { id: string; fullName: string | null } | null;
};

export type CompanyDetail = Omit<CompanyListItem, "contactCount"> & {
  website: string | null;
  phone: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  notes: string | null;
  updatedAt: string;
  ownerId: string | null;
};

export type CompanyListResult = {
  items: CompanyListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const COMPANY_SORT_COLUMNS: Record<CompanySortColumn, string[]> = {
  created_at: ["created_at", "id"],
  updated_at: ["updated_at", "id"],
  name: ["name", "id"],
};

export async function listCompanies(params: {
  organizationId: string;
  page: number;
  pageSize: number;
  sort: CompanySortColumn;
  direction: "asc" | "desc";
  query?: string | null;
  ownerId?: string | null;
}): Promise<CompanyListResult> {
  const supabase = await createSupabaseServerClient();
  const { organizationId, page, pageSize, sort, direction } = params;

  let request = supabase
    .from("companies")
    // `contacts(count)` is an aggregate embed: PostgREST turns it into a
    // lateral count per row, which avoids the N+1 that fetching contacts
    // separately for each company would cause.
    .select(
      "id, name, domain, industry, city, country, created_at, owner:profiles(id, full_name), contacts(count)",
      {
        count: "exact",
      },
    )
    .eq("organization_id", organizationId);

  if (params.ownerId) request = request.eq("owner_id", params.ownerId);

  const search = params.query?.trim();
  if (search) {
    const safe = search.replace(/[,()\\]/g, " ").trim();
    if (safe) {
      request = request.or([`name.ilike.*${safe}*`, `domain.ilike.*${safe}*`].join(","));
    }
  }

  for (const column of COMPANY_SORT_COLUMNS[sort]) {
    request = request.order(column, { ascending: direction === "asc", nullsFirst: false });
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await request.range(from, from + pageSize - 1);

  if (error) {
    return { items: [], total: 0, page, pageSize, pageCount: 0 };
  }

  const total = count ?? 0;

  return {
    items: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      city: row.city,
      country: row.country,
      createdAt: row.created_at,
      contactCount: row.contacts?.[0]?.count ?? 0,
      owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name } : null,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCompany(
  organizationId: string,
  id: string,
): Promise<CompanyDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("companies")
    .select(
      `id, name, domain, industry, website, phone, address_line1, postal_code, city,
       country, notes, created_at, updated_at, owner_id,
       owner:profiles(id, full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    domain: data.domain,
    industry: data.industry,
    website: data.website,
    phone: data.phone,
    addressLine1: data.address_line1,
    postalCode: data.postal_code,
    city: data.city,
    country: data.country,
    notes: data.notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    ownerId: data.owner_id,
    owner: data.owner ? { id: data.owner.id, fullName: data.owner.full_name } : null,
  };
}

/** Lightweight list for the company picker on the contact form. */
export async function listCompanyOptions(
  organizationId: string,
  limit = 500,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data;
}
