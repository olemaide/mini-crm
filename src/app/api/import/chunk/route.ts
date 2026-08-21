import { NextResponse, type NextRequest } from "next/server";

import { importChunkSchema } from "@/features/import/schema";
import { getSession } from "@/lib/auth/session";
import { createRequestLogger } from "@/lib/logger";
import { countryForOrg, normalizePhone } from "@/lib/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Receives one chunk of an import and hands it to the database.
 *
 * A Route Handler rather than a Server Action: this is called dozens of times
 * per import in a tight loop, and plain HTTP gives honest status codes, cheap
 * retries and no RSC payload riding along on every request.
 *
 * Chunking is the reason imports work at all here. A 5,000-row file processed
 * in one request would sit well past Netlify's function timeout; 500 rows at a
 * time keeps every request short and lets the browser show real progress.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { log, requestId } = createRequestLogger({ route: "/api/import/chunk" });

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "notAuthenticated", requestId }, { status: 401 });
  }

  /*
   * Per organization, not per user: the cost being protected is database work
   * for one tenant, and two colleagues importing at once should share the
   * budget rather than each getting a full one.
   *
   * 429 with Retry-After, because the client is a loop rather than a person —
   * import-wizard.tsx can honour the header and back off instead of hammering.
   */
  const limit = await consumeRateLimit("import.chunk", session.organization.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rateLimited", requestId },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalidBody", requestId }, { status: 400 });
  }

  const parsed = importChunkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalidBody", requestId }, { status: 400 });
  }

  /*
   * Phone normalisation happens here, not in the browser.
   *
   * It needs the organization's country to parse a national-format number, and
   * libphonenumber's metadata is far too large to ship to the client for a
   * one-off task. Convention 14 also wants every write path — manual entry,
   * import, future API — going through the same normalisers so a contact
   * created by import is byte-identical to one typed by hand.
   */
  const country = countryForOrg(session.organization.timezone);
  const rows = parsed.data.rows.map((row) => ({
    ...row,
    phone: normalizePhone(row.phone, country),
  }));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("import_contacts_chunk", {
    p_job_id: parsed.data.jobId,
    p_rows: rows,
  });

  if (error) {
    log.error({ code: error.code, jobId: parsed.data.jobId }, "import chunk failed");
    // 409 for "job is not running" so the client stops rather than retrying a
    // chunk that can never succeed.
    const status = error.code === "P0007" ? 409 : error.code === "P0002" ? 404 : 500;
    return NextResponse.json({ error: error.code ?? "unexpected", requestId }, { status });
  }

  return NextResponse.json({ ok: true, result: data, requestId });
}
