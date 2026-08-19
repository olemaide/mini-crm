import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validated environment configuration.
 *
 * Importing `env` anywhere fails the build (not the 3am page) when a variable
 * is missing or malformed. Never read `process.env` directly outside this file.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /**
     * Bypasses RLS. Server-only, never imported into a client component, and
     * checked for in the client bundle by CI.
     */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    /*
     * Polar. All optional so the app runs and builds without billing wired up —
     * the billing page renders a "not configured" state instead of crashing,
     * which is what you want while developing every other feature.
     */
    POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
    POLAR_WEBHOOK_SECRET: z.string().min(1).optional(),
    POLAR_ORGANIZATION_ID: z.uuid().optional(),
    POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
    /** Product ids, per plan and billing period. */
    POLAR_PRODUCT_STARTER_MONTHLY: z.uuid().optional(),
    POLAR_PRODUCT_STARTER_ANNUAL: z.uuid().optional(),
    POLAR_PRODUCT_PRO_MONTHLY: z.uuid().optional(),
    POLAR_PRODUCT_PRO_ANNUAL: z.uuid().optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_ORGANIZATION_ID: process.env.POLAR_ORGANIZATION_ID,
    POLAR_SERVER: process.env.POLAR_SERVER,
    POLAR_PRODUCT_STARTER_MONTHLY: process.env.POLAR_PRODUCT_STARTER_MONTHLY,
    POLAR_PRODUCT_STARTER_ANNUAL: process.env.POLAR_PRODUCT_STARTER_ANNUAL,
    POLAR_PRODUCT_PRO_MONTHLY: process.env.POLAR_PRODUCT_PRO_MONTHLY,
    POLAR_PRODUCT_PRO_ANNUAL: process.env.POLAR_PRODUCT_PRO_ANNUAL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  // Lets `pnpm build` run in CI without production secrets present.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
