import "server-only";

import { Polar } from "@polar-sh/sdk";

import { env } from "@/env";

/**
 * The Polar API client.
 *
 * Server-only, and never instantiated at module scope: the access token is
 * optional, so importing this file must not throw in an environment where
 * billing is not configured. Callers ask for the client and handle `null`.
 */
export function createPolarClient(): Polar | null {
  if (!env.POLAR_ACCESS_TOKEN) return null;

  return new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    // Sandbox and production are different hosts entirely. Getting this wrong
    // means checkout sessions that silently never become real money.
    server: env.POLAR_SERVER,
  });
}
