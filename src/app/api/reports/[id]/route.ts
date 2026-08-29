import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { reportPatchSchema } from "@/lib/report/schema";
import { getOwnedReport, updateOwnedReport } from "@/lib/report/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET   /api/reports/[id]   — the citizen's own draft, or 404 (never 403 —
 *                              see the note in report/store.ts on why a
 *                              missing report and someone else's report look
 *                              identical from the outside).
 * PATCH /api/reports/[id]   — citizen edits. Any field touched here is the
 *                              citizen's now, not the model's: its `*Source`
 *                              flips to "manual", the same rule the CNIC flow
 *                              uses when a citizen edits an extracted field.
 */

export async function GET(
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

  return NextResponse.json({ success: true, data: report });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getOwnedReport(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "We couldn't read that request." }, { status: 400 });
  }

  const parsed = reportPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Please check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const values = parsed.data;
  const patch: Record<string, unknown> = {};

  if (values.category !== undefined) {
    patch.category = values.category;
    patch.categorySource = "manual";
  }
  if (values.visionConfirmed !== undefined) {
    patch.visionConfirmed = values.visionConfirmed;
  }
  if (values.title !== undefined) {
    patch.title = values.title;
    patch.titleSource = "manual";
  }
  if (values.description !== undefined) {
    patch.description = values.description;
    patch.descriptionSource = "manual";
  }
  if (values.severity !== undefined) {
    patch.severity = values.severity;
    patch.severitySource = "manual";
  }
  if (values.locationLabel !== undefined) {
    patch.locationLabel = values.locationLabel;
    patch.locationSource = "manual";
  }

  const updated = await updateOwnedReport(id, session.user.id, patch);
  return NextResponse.json({ success: true, data: updated });
}
