import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getOwnedReport, updateOwnedReport } from "@/lib/report/store";

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

  return NextResponse.json({ success: true, data: updated });
}
