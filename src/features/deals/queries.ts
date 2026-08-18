import "server-only";

import { defaultPipelineSeed } from "@/lib/seed/stages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BoardCard = {
  id: string;
  title: string;
  value_cents: number;
  currency: string;
  position: number;
  expected_close_date: string | null;
  stage_entered_at: string;
  contact: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string | null } | null;
};

export type BoardStage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  deal_count: number;
  total_cents: number;
  weighted_cents: number;
  cards: BoardCard[];
};

export type Board = { pipeline_id: string; stages: BoardStage[] };

/**
 * Resolves the organization's default pipeline, creating it on first use.
 *
 * Lazy rather than seeded inside create_organization: it also covers
 * organizations that existed before pipelines did, so no backfill is needed.
 * The RPC is idempotent, so a concurrent second call returns the same pipeline
 * rather than creating a duplicate.
 */
export async function getOrCreateDefaultPipeline(
  organizationId: string,
  locale: string,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("pipelines")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) return existing.id;

  const seed = defaultPipelineSeed(locale);
  const { data, error } = await supabase.rpc("seed_default_pipeline", {
    p_organization_id: organizationId,
    p_name: seed.pipelineName,
    p_stages: seed.stages,
  });

  if (error || !data) return null;
  return data;
}

/** The whole board in one round trip — stages, aggregates and capped cards. */
export async function getBoard(
  pipelineId: string,
  options: { ownerId?: string | null; query?: string | null; cardsPerStage?: number } = {},
): Promise<Board | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("pipeline_board", {
    p_pipeline_id: pipelineId,
    p_owner_id: options.ownerId ?? undefined,
    p_query: options.query ?? undefined,
    p_cards_per_stage: options.cardsPerStage ?? 50,
  });

  if (error || !data) return null;
  return data as unknown as Board;
}

export type StageOption = {
  id: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
};

export async function listStages(
  organizationId: string,
  pipelineId: string,
): Promise<StageOption[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, name, position, probability, is_won, is_lost, deals(count)")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    position: Number(row.position),
    probability: Number(row.probability),
    isWon: row.is_won,
    isLost: row.is_lost,
    dealCount: row.deals?.[0]?.count ?? 0,
  }));
}

export type DealDetail = {
  id: string;
  title: string;
  valueCents: number;
  currency: string;
  status: "open" | "won" | "lost";
  expectedCloseDate: string | null;
  lostReason: string | null;
  stageEnteredAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pipelineId: string;
  stageId: string;
  contactId: string | null;
  companyId: string | null;
  ownerId: string | null;
  stage: { id: string; name: string; probability: number; isWon: boolean; isLost: boolean } | null;
  contact: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string | null } | null;
};

export async function getDeal(organizationId: string, id: string): Promise<DealDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("deals")
    .select(
      `id, title, value_cents, currency, status, expected_close_date, lost_reason,
       stage_entered_at, closed_at, created_at, updated_at,
       pipeline_id, stage_id, contact_id, company_id, owner_id,
       stage:pipeline_stages(id, name, probability, is_won, is_lost),
       contact:contacts(id, first_name, last_name),
       company:companies(id, name),
       owner:profiles(id, full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const contactName = data.contact
    ? [data.contact.first_name, data.contact.last_name].filter(Boolean).join(" ").trim()
    : null;

  return {
    id: data.id,
    title: data.title,
    valueCents: Number(data.value_cents),
    currency: data.currency,
    status: data.status,
    expectedCloseDate: data.expected_close_date,
    lostReason: data.lost_reason,
    stageEnteredAt: data.stage_entered_at,
    closedAt: data.closed_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    pipelineId: data.pipeline_id,
    stageId: data.stage_id,
    contactId: data.contact_id,
    companyId: data.company_id,
    ownerId: data.owner_id,
    stage: data.stage
      ? {
          id: data.stage.id,
          name: data.stage.name,
          probability: Number(data.stage.probability),
          isWon: data.stage.is_won,
          isLost: data.stage.is_lost,
        }
      : null,
    contact: data.contact ? { id: data.contact.id, name: contactName || "" } : null,
    company: data.company ? { id: data.company.id, name: data.company.name } : null,
    owner: data.owner ? { id: data.owner.id, name: data.owner.full_name } : null,
  };
}

/** Deals attached to one contact or company, for their detail pages. */
export async function listDealsFor(
  organizationId: string,
  link: { contactId?: string; companyId?: string },
): Promise<
  {
    id: string;
    title: string;
    valueCents: number;
    currency: string;
    status: string;
    stageName: string | null;
  }[]
> {
  const supabase = await createSupabaseServerClient();

  let request = supabase
    .from("deals")
    .select("id, title, value_cents, currency, status, stage:pipeline_stages(name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (link.contactId) request = request.eq("contact_id", link.contactId);
  if (link.companyId) request = request.eq("company_id", link.companyId);

  const { data, error } = await request;
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    valueCents: Number(row.value_cents),
    currency: row.currency,
    status: row.status,
    stageName: row.stage?.name ?? null,
  }));
}
