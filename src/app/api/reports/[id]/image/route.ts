import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getOwnedReportRow, updateOwnedReport } from "@/lib/report/store";
import {
  mimeTypeForReportPath,
  reportImageAbsolutePath,
  sniffImageMimeType,
  storeReportImage,
} from "@/lib/report-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

/*
 * POST /api/reports/[id]/image — uploads (or replaces) the report's photo.
 * GET  /api/reports/[id]/image — streams it back, owner-only.
 *
 * The client's declared file type is never trusted: the bytes are sniffed
 * for a real JPEG/PNG/WebP signature before anything is written to disk.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  const { id } = await params;
  const report = await getOwnedReportRow(id, session.user.id);
  if (!report) {
    return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("image");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ success: false, message: "We couldn't read that upload." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ success: false, message: "Please choose a photo." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, reason: "too_large", message: "That photo is too large. Please retake it." },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const realMimeType = sniffImageMimeType(bytes);

  if (!realMimeType) {
    return NextResponse.json(
      {
        success: false,
        reason: "unsupported_type",
        message: "Please upload a JPEG, PNG or WebP photo.",
      },
      { status: 415 },
    );
  }

  const stored = await storeReportImage(session.user.id, id, bytes, realMimeType);
  if (!stored) {
    return NextResponse.json({ success: false, message: "We couldn't save that photo." }, { status: 500 });
  }

  const updated = await updateOwnedReport(id, session.user.id, {
    imagePath: stored.relativePath,
    imageMimeType: stored.mimeType,
    // A new photo invalidates any earlier vision result taken from the old one.
    category: null,
    categorySource: null,
    visionConfidence: null,
    visionEvidence: null,
    visionConfirmed: false,
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const report = await getOwnedReportRow(id, session.user.id);
  if (!report?.imagePath) return new NextResponse(null, { status: 404 });

  const absolute = reportImageAbsolutePath(report.imagePath);
  if (!absolute) return new NextResponse(null, { status: 404 });

  try {
    const bytes = await readFile(absolute);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": mimeTypeForReportPath(report.imagePath),
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
