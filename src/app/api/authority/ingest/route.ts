import { NextResponse } from "next/server";

import { getAuthorityViewer } from "@/lib/authority/access";
import { ingestPendingReports } from "@/services/authority/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/authority/ingest
 *
 * Pulls every confirmed citizen report that is not yet part of an issue
 * through the routing and duplicate-detection agents.
 *
 * Exposed as an explicit action rather than wired into the citizen's confirm
 * route, so Stage 3 adds no code to the Stage 1/2 flow. In production this is
 * what a queue worker would call on a timer.
 */
export async function POST() {
  const viewer = await getAuthorityViewer();
  if (!viewer) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const outcomes = await ingestPendingReports();

  return NextResponse.json({
    success: true,
    data: {
      processed: outcomes.length,
      issuesCreated: outcomes.filter((o) => o.created).length,
      grouped: outcomes.filter((o) => o.matchStatus === "auto_grouped").length,
      needsReview: outcomes.filter((o) => o.matchStatus === "needs_review").length,
    },
  });
}
