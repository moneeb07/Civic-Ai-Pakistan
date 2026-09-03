import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getCitizenSummary, listCitizenReports } from "@/lib/civic/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthenticated = () =>
  NextResponse.json(
    { success: false, message: "Please sign in.", reason: "unauthenticated" },
    { status: 401 },
  );

/**
 * GET /api/citizen/tracking — this citizen's reports and how they are going.
 *
 * The web "My Reports" screen calls the tracking service directly as a server
 * component; the mobile app cannot, so the same data is exposed here. Both go
 * through the identical service, which is what keeps the two clients from
 * drifting into telling people different things about the same report.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthenticated();

  const [summary, reports] = await Promise.all([
    getCitizenSummary(session.user.id),
    listCitizenReports(session.user.id),
  ]);

  return NextResponse.json({ success: true, data: { summary, reports } });
}
