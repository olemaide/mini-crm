import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSession, isAtLeastAdmin } from "@/lib/auth/session";
import { rowsToCsv } from "@/lib/csv/serialize";
import { createRequestLogger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * DSGVO Art. 20 export endpoint.
 *
 * A Route Handler rather than a Server Action, because the product of this call
 * is a **file**. A Server Action would have to return the whole document as an
 * RSC payload for the browser to turn back into a Blob — doubling it in memory
 * on both ends, and losing the filename, the content type and the browser's own
 * download UI. A GET with `Content-Disposition` gets all of that for free.
 *
 * Authorization is checked here *and* inside `export_organization()`, which is
 * `security invoker` and admin-guarded. The organization is taken from the
 * session, never from a query parameter, so there is no tenant id to tamper
 * with.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Collections a CSV can be requested for — an allow-list, not a free-text key.
 * Without it, `?entity=` would let a caller name any property of the export
 * document, including the organization row and the subscription.
 */
const CSV_COLLECTIONS = [
  "contacts",
  "companies",
  "deals",
  "tasks",
  "activities",
  "importJobs",
] as const;

const querySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  entity: z.enum(CSV_COLLECTIONS).default("contacts"),
});

/** `Acme GmbH` → `acme-gmbh`, for a filename that survives every filesystem. */
function slugForFilename(name: string): string {
  const slug = name
    .toLowerCase()
    // Decompose first, then drop the marks, so an umlaut becomes a letter
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "organization";
}

export async function GET(request: NextRequest) {
  const { log, requestId } = createRequestLogger({ route: "/api/export" });

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "notAuthenticated", requestId }, { status: 401 });
  }
  if (!isAtLeastAdmin(session.role)) {
    return NextResponse.json({ error: "notAuthorized", requestId }, { status: 403 });
  }

  /*
   * Per organization. A whole-tenant export is the most expensive read in the
   * product, and it is also the shape a compromised admin session would use to
   * exfiltrate everything — five an hour is plenty for a real person and slow
   * enough to notice in the logs.
   */
  const limit = await consumeRateLimit("export.organization", session.organization.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rateLimited", requestId },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = querySchema.safeParse({
    format: request.nextUrl.searchParams.get("format") ?? undefined,
    entity: request.nextUrl.searchParams.get("entity") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalidRequest", requestId }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("export_organization", {
    p_organization_id: session.organization.id,
  });

  if (error || !data) {
    log.error({ code: error?.code }, "export failed");
    return NextResponse.json({ error: "exportUnavailable", requestId }, { status: 500 });
  }

  const payload = data as unknown as Record<string, unknown> & {
    members?: { user_id: string }[];
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${slugForFilename(session.organization.name)}-${stamp}`;

  if (parsed.data.format === "csv") {
    const collection = payload[parsed.data.entity ?? "contacts"];
    const rows = Array.isArray(collection) ? (collection as Record<string, unknown>[]) : [];

    return new NextResponse(rowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-${parsed.data.entity ?? "contacts"}.csv"`,
        // Nothing about a personal-data export should sit in a cache.
        "Cache-Control": "no-store, private",
      },
    });
  }

  /*
   * Member email addresses live in `auth.users`, which PostgREST does not
   * expose, so they are joined in here with the service-role client rather than
   * by widening the SQL function. Art. 20 covers the account data too, and an
   * export listing members by opaque UUID is not a portable record of anything.
   *
   * One lookup per member, not `listUsers()`: the latter pages through every
   * user in the project, which is both slower and a much larger blast radius
   * for a bug.
   */
  const admin = createSupabaseAdminClient();
  const memberIds = Array.isArray(payload.members)
    ? payload.members.map((member) => member.user_id).filter(Boolean)
    : [];

  const emails = await Promise.all(
    memberIds.map(async (userId) => {
      const { data: user, error: userError } = await admin.auth.admin.getUserById(userId);
      if (userError || !user?.user) return { user_id: userId, email: null };
      return { user_id: userId, email: user.user.email ?? null };
    }),
  );

  const document = { ...payload, memberEmails: emails };

  log.info({ organizationId: session.organization.id }, "organization exported");

  return new NextResponse(JSON.stringify(document, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.json"`,
      "Cache-Control": "no-store, private",
    },
  });
}
