import "server-only";

import { parseGovEnv, type GovEnv } from "./env-schema";

/*
 * The government portal's environment, validated once per process.
 *
 * Feature code never reads process.env directly — it calls govEnv(). That way
 * a missing or malformed variable is a single clear error at the boundary
 * rather than `undefined` silently flowing into an SMTP client.
 *
 * Nothing here is required to run the portal: with EMAIL_ROUTING_ENABLED unset
 * (the default), invites are logged to the terminal and no SMTP variable is
 * ever read. See src/services/email/invite-mailer.ts.
 *
 * The rules themselves live in env-schema.ts, which carries no "server-only"
 * import and is therefore unit-testable (tests/gov-env.test.ts).
 */

let cached: GovEnv | null = null;

export function govEnv(): GovEnv {
  if (!cached) {
    cached = parseGovEnv(process.env);
  }
  return cached;
}

/** Test seam: forces the next govEnv() call to re-read process.env. */
export function resetGovEnvCache(): void {
  cached = null;
}

export type { GovEnv };
