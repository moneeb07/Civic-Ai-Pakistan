import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { findOfficerByUserId } from "@/lib/gov/session";
import { getCitizenProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/me — who is signed in, and which sides of the product they can use.
 *
 * This is the endpoint the mobile app calls first. The app ships as ONE binary
 * with a role switch rather than two, so it needs a single answer to "am I a
 * citizen, an officer, or both?" before it decides what to render.
 *
 * Both is the normal case, not an edge case: an officer of a water department
 * still has potholes outside their own house, and reports them as a member of
 * the public. Being staff is therefore additive here — it never replaces the
 * citizen identity, and `canSwitch` is what puts the toggle in the app's UI.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Please sign in.", reason: "unauthenticated" },
      { status: 401 },
    );
  }

  const [officer, profile] = await Promise.all([
    findOfficerByUserId(session.user.id),
    getCitizenProfile(session.user.id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: session.user.id,
        name: profile?.fullName ?? session.user.name,
        email: session.user.email,
      },
      /* Every signed-in account can file a report; only some are staff. */
      citizen: { available: true, profileComplete: Boolean(profile?.fullName) },
      officer: officer
        ? {
            available: true,
            officerId: officer.id,
            role: officer.role,
            orgId: officer.orgId,
            orgName: officer.orgName,
            deptId: officer.deptId,
            deptName: officer.deptName,
          }
        : { available: false },
      canSwitch: Boolean(officer),
    },
  });
}
