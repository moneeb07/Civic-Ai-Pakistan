import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { createReportDraft, listOwnedReports } from "@/lib/report/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/reports — starts a new complaint draft for the signed-in citizen.
 * GET  /api/reports — lists the citizen's own drafts (their reports only).
 */

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  const report = await createReportDraft(session.user.id);
  return NextResponse.json({ success: true, data: report });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  const reports = await listOwnedReports(session.user.id);
  return NextResponse.json({ success: true, data: reports });
}
