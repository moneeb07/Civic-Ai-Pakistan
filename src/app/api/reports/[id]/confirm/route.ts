import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getOwnedReport, updateOwnedReport } from "@/lib/report/store";
import { ingestReport } from "@/services/authority/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/reports/[id]/confirm
 *
 * The citizen's explicit confirmation that the structured complaint is
 * correct. This is the ONLY place a report's status can become
 * "ready_for_submission" — and that is where Stage 2 ends. No government
 * authority is contacted here or anywhere else in this codebase; routing a
 * confirmed report to a real authority is future work, not simulated here.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  const { id } = await params;
  const report = await getOwnedReport(id, session.user.id);
  if (!report) {
    return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
  }

  const missing: string[] = [];
  if (!report.hasImage) missing.push("photo");
  if (!report.category) missing.push("category");
  if (!report.description) missing.push("description");
  if (!report.locationLabel && report.latitude === null) missing.push("location");

  if (missing.length > 0) {
    return NextResponse.json(
      {
        success: false,
        reason: "incomplete",
        missing,
        message: "Please complete every section before confirming.",
      },
      { status: 400 },
    );
  }

  const updated = await updateOwnedReport(id, session.user.id, {
    status: "ready_for_submission",
  });

  /*
   * Hand the confirmed report to the authority-side intake pipeline, which
   * routes it to a department and either attaches it to an existing civic
   * issue or opens a new one.
   *
   * Deliberately best-effort and non-blocking for the citizen: their report is
   * already saved and confirmed by this point, and if intake is unavailable
   * the report simply stays unlinked and is picked up by the next pass
   * (ingestPendingReports scans for exactly this). A citizen must never be
   * told their complaint failed because a downstream agent was down.
   */
  let issueCode: string | null = null;
  try {
    const outcome = await ingestReport(id);
    issueCode = outcome?.issueCode ?? null;
  } catch {
    // Logged as a shape, never with report contents.
    console.error("[reports/confirm] intake deferred for one report");
  }

  return NextResponse.json({ success: true, data: updated, issueCode });
}
