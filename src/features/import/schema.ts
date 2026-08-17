import { z } from "zod";

import { IMPORT_FIELDS } from "@/lib/csv";

export const duplicatePolicies = ["skip", "update", "create"] as const;
export type DuplicatePolicy = (typeof duplicatePolicies)[number];

export const createImportJobSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  totalRows: z.int().min(1).max(20_000),
  duplicatePolicy: z.enum(duplicatePolicies),
  createCompanies: z.boolean(),
  mapping: z.record(z.string(), z.enum(IMPORT_FIELDS).nullable()),
});

/**
 * One row as it arrives at the chunk endpoint.
 *
 * `passthrough` is deliberately absent: an unexpected key would be forwarded
 * into the RPC's jsonb and silently ignored, which is a quiet way for a bug to
 * survive. Strict parsing surfaces a mapping mistake immediately.
 */
export const importRowSchema = z.object({
  row: z.int().min(0),
  first_name: z.string().max(200).nullable(),
  last_name: z.string().max(200).nullable(),
  email: z.string().max(255).nullable(),
  phone: z.string().max(100).nullable(),
  job_title: z.string().max(200).nullable(),
  linkedin_url: z.string().max(600).nullable(),
  notes: z.string().max(10_000).nullable(),
  company_name: z.string().max(300).nullable(),
  company_domain: z.string().max(300).nullable(),
  _error: z.string().max(60).optional(),
});

export const importChunkSchema = z.object({
  jobId: z.uuid(),
  // Matches the RPC's own guard. The UI sends 500.
  rows: z.array(importRowSchema).min(1).max(1000),
});

export const jobIdSchema = z.object({ jobId: z.uuid() });

export const finalizeJobSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(["completed", "failed", "cancelled"]),
});

export const previewDuplicatesSchema = z.object({
  emails: z.array(z.string().max(255)).max(20_000),
  phones: z.array(z.string().max(100)).max(20_000),
});

export type ImportRowInput = z.infer<typeof importRowSchema>;
