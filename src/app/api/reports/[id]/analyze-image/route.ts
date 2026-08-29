import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getOwnedReportRow, updateOwnedReport } from "@/lib/report/store";
import { reportImageAbsolutePath } from "@/lib/report-image";
import {
  VisionAnalysisError,
  getVisionProvider,
  isVisionConfigured,
} from "@/services/vision/report-vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/reports/[id]/analyze-image
 *
 * Runs vision analysis on whatever photo is already stored for this report.
 * Nothing here is shown to the citizen as fact — the response is a guess with
 * a confidence score, and the review UI must present it as "Possible X",
 * pending the citizen's own "yes/no".
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  if (!isVisionConfigured()) {
    return NextResponse.json(
      {
        success: false,
        reason: "not_configured",
        message: "Automatic problem detection isn't available right now. You can describe the problem yourself instead.",
      },
      { status: 503 },
    );
  }

  const { id } = await params;
  const report = await getOwnedReportRow(id, session.user.id);
  if (!report) {
    return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
  }
  if (!report.imagePath || !report.imageMimeType) {
    return NextResponse.json({ success: false, message: "Please add a photo first." }, { status: 400 });
  }

  const absolute = reportImageAbsolutePath(report.imagePath);
  if (!absolute) {
    return NextResponse.json({ success: false, message: "That photo could not be read." }, { status: 500 });
  }

  try {
    const bytes = await readFile(absolute);
    const result = await getVisionProvider().analyzeImage(bytes, report.imageMimeType);

    const updated = await updateOwnedReport(id, session.user.id, {
      category: result.detected ? result.category : null,
      categorySource: result.detected ? "ai" : null,
      visionConfidence: result.confidence,
      visionEvidence: JSON.stringify(result.evidence),
      visionConfirmed: false,
      status: "analyzing",
    });

    return NextResponse.json({ success: true, data: { report: updated, vision: result } });
  } catch (error) {
    if (error instanceof VisionAnalysisError) {
      return NextResponse.json(
        {
          success: false,
          reason: error.reason,
          message: "We couldn't analyse that photo automatically. You can describe the problem yourself instead.",
        },
        { status: error.reason === "not_configured" ? 503 : 502 },
      );
    }

    console.error("[analyze-image] unexpected failure");
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
