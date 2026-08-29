import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getOwnedReportRow, updateOwnedReport } from "@/lib/report/store";
import type { CivicCategory } from "@/lib/report/schema";
import {
  ComplaintGenerationError,
  getComplaintGenerationProvider,
  isComplaintGenerationConfigured,
} from "@/services/complaint/complaint-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/reports/[id]/generate
 *
 * The core Stage 2 intelligence step: category + vision evidence + the
 * citizen's own words + location -> a structured, editable complaint.
 * Never auto-submitted — this only reaches "ready_for_review"; a citizen
 * confirmation via /confirm is a separate, later step.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  if (!isComplaintGenerationConfigured()) {
    return NextResponse.json(
      {
        success: false,
        reason: "not_configured",
        message: "We couldn't prepare the report automatically. You can fill it in yourself instead.",
      },
      { status: 503 },
    );
  }

  const { id } = await params;
  const report = await getOwnedReportRow(id, session.user.id);
  if (!report) {
    return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
  }

  if (!report.category) {
    return NextResponse.json({ success: false, message: "Please confirm the type of problem first." }, { status: 400 });
  }
  if (!report.transcript) {
    return NextResponse.json({ success: false, message: "Please describe the problem first." }, { status: 400 });
  }

  try {
    const generated = await getComplaintGenerationProvider().generate({
      category: report.category as CivicCategory,
      visionEvidence: report.visionEvidence ? JSON.parse(report.visionEvidence) : [],
      citizenDescription: report.transcript,
      locationLabel: report.locationLabel,
    });

    const updated = await updateOwnedReport(id, session.user.id, {
      title: generated.title,
      titleSource: "ai",
      description: generated.description,
      descriptionSource: "ai",
      severity: generated.severity,
      severitySource: "ai",
      status: "ready_for_review",
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    /*
     * The brief is explicit: an AI failure must never lose what the citizen
     * already provided. Nothing is written here on failure — the image,
     * transcript, category and location captured so far all remain exactly
     * as they were, and the client's "Try Again" / "Edit Manually" options
     * both operate on that still-intact draft.
     */
    if (error instanceof ComplaintGenerationError) {
      return NextResponse.json(
        {
          success: false,
          reason: error.reason,
          message: "We couldn't prepare the report automatically. You can fill it in yourself instead.",
        },
        { status: error.reason === "not_configured" ? 503 : 502 },
      );
    }

    console.error("[generate] unexpected failure");
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
