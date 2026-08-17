import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    // Generates a typed declaration from the English catalogue, so a missing or
    // misspelled message key is a TypeScript error rather than a runtime "???".
    createMessagesDeclaration: "./messages/en.json",
  },
});

/**
 * Baseline security headers. A Content-Security-Policy is deliberately absent
 * here — it needs per-request nonces and belongs with the hardening work in
 * Phase 9, where it can be verified properly rather than shipped half-configured.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // pino resolves transports at runtime, which bundlers cannot follow.
  serverExternalPackages: ["pino", "pino-pretty"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
