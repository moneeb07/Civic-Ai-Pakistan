import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { listThreadsForCitizen } from "@/lib/gov/clarification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/citizen/clarifications
 *
 * Questions the department has asked this citizen. Authenticated as a CITIZEN,
 * not an officer — this is the public half of the channel, and it is the same
 * endpoint the mobile app uses.
 *
 * Scoped by the session's own user id inside the query, so there is no
 * parameter through which one citizen could read another's messages.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Please sign in.", reason: "unauthenticated" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    data: await listThreadsForCitizen(session.user.id),
  });
}
