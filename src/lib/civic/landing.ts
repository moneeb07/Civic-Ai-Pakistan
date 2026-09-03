import "server-only";

import { findOfficerByUserId } from "@/lib/gov/session";
import { getCitizenProfile } from "@/lib/profile";

export { safeNextPath } from "@/lib/civic/next-path";

/*
 * Where a person belongs after signing in.
 *
 * CivicAI has two halves and one authentication system, so the destination has
 * to come from what an account actually IS, not from which button was pressed.
 * A department member who signs in from a bookmark, or gets bounced here by the
 * proxy, must still land in their workspace.
 *
 * The dual-role case is real and is handled deliberately rather than by
 * precedence: someone can be both a citizen who reports potholes and a member
 * of a department that fixes them. They keep the citizen dashboard as their
 * home — that is the account they registered — and are offered a link across.
 * Silently redirecting them into the authority workspace would take away the
 * ability to use CivicAI as a citizen at all.
 */

export type LandingRole = "citizen" | "authority" | "both";

export interface LandingDecision {
  role: LandingRole;
  /** Where to send them, or null to stay on the citizen dashboard. */
  redirectTo: string | null;
}

export async function resolveLanding(userId: string): Promise<LandingDecision> {
  const [officer, profile] = await Promise.all([
    findOfficerByUserId(userId),
    getCitizenProfile(userId),
  ]);

  if (!officer) return { role: "citizen", redirectTo: null };
  if (profile) return { role: "both", redirectTo: null };

  return { role: "authority", redirectTo: "/gov" };
}
