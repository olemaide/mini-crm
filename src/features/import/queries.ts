import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type ImportJobError = { row: number; code: string; message: string };

export type ImportJobSummary = {
  id: string;
  filename: string;
  status: Database["public"]["Enums"]["import_status"];
  duplicatePolicy: Database["public"]["Enums"]["import_duplicate_policy"];
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: ImportJobError[];
  createdAt: string;
  completedAt: string | null;
  createdByName: string | null;
  /** Undo is only offered while the run is still the most recent state. */
  canUndo: boolean;
};

function toSummary(row: {
  id: string;
  filename: string;
  status: Database["public"]["Enums"]["import_status"];
  duplicate_policy: Database["public"]["Enums"]["import_duplicate_policy"];
  total_rows: number;
  processed_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  errors: unknown;
  created_at: string;
  completed_at: string | null;
  creator?: { full_name: string | null } | null;
}): ImportJobSummary {
  const errors = Array.isArray(row.errors) ? (row.errors as ImportJobError[]) : [];

  return {
    id: row.id,
    filename: row.filename,
    status: row.status,
    duplicatePolicy: row.duplicate_policy,
    totalRows: row.total_rows,
    processedRows: row.processed_rows,
    createdCount: row.created_count,
    updatedCount: row.updated_count,
    skippedCount: row.skipped_count,
    errorCount: row.error_count,
    errors,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    createdByName: row.creator?.full_name ?? null,
    canUndo: row.status === "completed" && row.created_count > 0,
  };
}

const SELECT = `
  id, filename, status, duplicate_policy, total_rows, processed_rows,
  created_count, updated_count, skipped_count, error_count, errors,
  created_at, completed_at,
  creator:profiles(full_name)
`;

export async function listImportJobs(
  organizationId: string,
  limit = 20,
): Promise<ImportJobSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("import_jobs")
    .select(SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(toSummary);
}

export async function getImportJob(
  organizationId: string,
  jobId: string,
): Promise<ImportJobSummary | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("import_jobs")
    .select(SELECT)
    .eq("organization_id", organizationId)
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) return null;
  return toSummary(data);
}
