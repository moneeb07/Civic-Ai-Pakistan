import { NextResponse } from "next/server";

import { getPublicPerformance } from "@/lib/civic/tracking";
import { rankAuthorities, summarise } from "@/lib/gov/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/performance — the public accountability figures.
 *
 * Deliberately unauthenticated, matching the web page it backs: "accountability
 * that requires a login is not accountability". Everything here is already
 * public on /performance; this is the same data for a client that cannot run
 * a React server component.
 *
 * The RANKING is computed here rather than on the client, on purpose. It is
 * not a sort — it is Bayesian shrinkage toward the national average plus a
 * minimum-caseload threshold (see lib/gov/performance.ts). Two clients each
 * reimplementing that would eventually disagree about who is first, and a
 * league table that ranks an authority differently on phone and laptop is
 * worse than no league table. One computation, one answer, both clients.
 */
export async function GET() {
  const rows = rankAuthorities(await getPublicPerformance());

  return NextResponse.json({
    success: true,
    data: { authorities: rows, summary: summarise(rows) },
  });
}
