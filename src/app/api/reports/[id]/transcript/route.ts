import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { describeTextPayloadSchema } from "@/lib/report/schema";
import { getOwnedReportRow, updateOwnedReport } from "@/lib/report/store";
import {
  TranscriptionError,
  getSpeechToTextProvider,
  isSpeechToTextConfigured,
} from "@/services/speech/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const ACCEPTED_AUDIO = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

/*
 * POST /api/reports/[id]/transcript
 *
 * Two ways in, one destination field:
 *   multipart/form-data { audio: File } -> transcribed via Gemini
 *   application/json    { text: string } -> the citizen's own typed words, no AI involved
 *
 * Either way the result lands in the same `transcript` column — the review
 * screen doesn't need to know which path it came from, only whether the
 * citizen has since edited it (transcriptSource).
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

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "We couldn't read that request." }, { status: 400 });
    }

    const parsed = describeTextPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Please enter a description." }, { status: 400 });
    }

    const updated = await updateOwnedReport(id, session.user.id, {
      transcript: parsed.data.text,
      transcriptLanguage: null,
      transcriptSource: "manual",
    });

    return NextResponse.json({ success: true, data: updated });
  }

  // -- Voice path -------------------------------------------------------------

  if (!isSpeechToTextConfigured()) {
    return NextResponse.json(
      {
        success: false,
        reason: "not_configured",
        message: "Voice transcription isn't available right now. Please type your description instead.",
      },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("audio");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ success: false, message: "We couldn't read that recording." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ success: false, message: "Please record a description." }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { success: false, message: "That recording is too long. Please record a shorter description." },
      { status: 413 },
    );
  }

  if (!ACCEPTED_AUDIO.has(file.type)) {
    return NextResponse.json(
      { success: false, message: "We couldn't process that recording. Please try again." },
      { status: 415 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await getSpeechToTextProvider().transcribe(bytes, file.type);

    if (!result.transcript || !result.confident) {
      return NextResponse.json(
        {
          success: false,
          reason: "unclear",
          message: "We couldn't clearly understand that recording. Please try again, or type your description instead.",
        },
        { status: 422 },
      );
    }

    const updated = await updateOwnedReport(id, session.user.id, {
      transcript: result.transcript,
      transcriptLanguage: result.language,
      transcriptSource: "ai",
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return NextResponse.json(
        {
          success: false,
          reason: error.reason,
          message: "We couldn't process that recording. Please try again, or type your description instead.",
        },
        { status: error.reason === "not_configured" ? 503 : 502 },
      );
    }

    console.error("[transcript] unexpected failure");
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
