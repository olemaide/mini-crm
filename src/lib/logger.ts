import "server-only";

import { randomUUID } from "node:crypto";
import pino from "pino";

import { env } from "@/env";

const isDev = env.NODE_ENV === "development";

/**
 * Structured server logger.
 *
 * With Sentry deferred (build plan §1.4), this is the only post-mortem tool for
 * production. Every mutation should log through a child logger carrying a
 * request id, so a customer report can be traced to a single line in the
 * Netlify function log.
 *
 * `redact` is not optional here: a CRM's log payloads are full of personal data,
 * and logs are the easiest place to leak it by accident.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "email",
      "*.email",
      "*.phone",
      "*.password",
      "*.token",
      "*.access_token",
      "*.refresh_token",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});

export type RequestLogger = ReturnType<typeof logger.child>;

/**
 * Creates a child logger bound to a fresh request id. Return the id to the
 * caller on failure so a user can quote it in a support message.
 */
export function createRequestLogger(context: Record<string, unknown> = {}): {
  log: RequestLogger;
  requestId: string;
} {
  const requestId = randomUUID();
  return { log: logger.child({ requestId, ...context }), requestId };
}
