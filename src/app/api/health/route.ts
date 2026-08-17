import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRequestLogger } from "@/lib/logger";

/**
 * Liveness + database reachability probe for the uptime monitor.
 *
 * Deliberately unauthenticated and deliberately boring: it must not depend on
 * anything that could itself be broken. The Supabase call is a trivial read
 * against a table that is public-by-design, so a failure here means the
 * database is genuinely unreachable rather than that a policy changed.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const { log, requestId } = createRequestLogger({ route: "/api/health" });

  let database: "ok" | "unreachable" = "ok";
  let databaseError: string | undefined;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("health_check").select("ok").limit(1);
    if (error) {
      database = "unreachable";
      databaseError = error.message;
    }
  } catch (error) {
    database = "unreachable";
    databaseError = error instanceof Error ? error.message : "unknown error";
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const healthy = database === "ok";

  if (!healthy) {
    log.error({ database, databaseError, durationMs }, "health check failed");
  }

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      durationMs,
      requestId,
      commit: process.env.COMMIT_REF ?? "local",
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
