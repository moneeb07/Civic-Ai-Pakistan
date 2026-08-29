import "server-only";

import { govEnv } from "@/lib/gov/env";
import type { OfficerRole } from "@/lib/gov/schema";
import { formatInviteBox, type InviteBoxInput } from "./invite-box";

/*
 * Invite delivery.
 *
 * Two branches, one honest toggle:
 *
 *   EMAIL_ROUTING_ENABLED=false (default) — the invite is printed to the
 *     server console as a copy-pasteable block. This is the development path
 *     and it is complete: everything the recipient needs is on screen.
 *
 *   EMAIL_ROUTING_ENABLED=true — the SMTP path, which throws. That is
 *     deliberate. A silent no-op with the flag on would look exactly like
 *     working email while nothing was delivered; failing loudly is the only
 *     behaviour that can't be mistaken for success.
 *
 * The provider seam is the same one the citizen side uses for its AI
 * services: a narrow interface with one real implementation, so a real SMTP
 * or transactional-email client can replace the throwing branch without any
 * caller changing.
 */

export interface SendInviteEmailInput {
  to: string;
  /** Absolute, e.g. http://localhost:3000/gov/invite/<token> */
  inviteUrl: string;
  role: OfficerRole;
  orgName?: string;
  deptName?: string;
  expiresAt: Date;
}

export interface SendInviteEmailResult {
  delivered: "terminal" | "smtp";
}

export async function sendInviteEmail(
  input: SendInviteEmailInput,
): Promise<SendInviteEmailResult> {
  const env = govEnv();

  if (!env.EMAIL_ROUTING_ENABLED) {
    // console.log, not console.info: this is the operator's primary output in
    // dev mode, not a diagnostic they should have to raise the log level for.
    console.log(formatInviteBox(input satisfies InviteBoxInput));
    return { delivered: "terminal" };
  }

  throw new Error("SMTP not yet implemented");
}
