import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getOwnedReportRow } from "@/lib/report/store";
import { MAX_SPOKEN_CHARS, SynthesisError, speakText } from "@/services/speech/synthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/reports/[id]/narration  { text }  ->  audio/mpeg
 *
 * Reads a short Urdu prompt aloud for the citizen confirming what the AI saw
 * in their photograph.
 *
 * WHY THE TEXT IS POSTED RATHER THAN LOOKED UP. The sentence being spoken is
 * the vision model's Urdu summary, which the client already holds and which is
 * not persisted on the report — it is a property of one analysis, not of the
 * report. Posting it avoids a column and a migration for a string that lives
 * for the length of one screen.
 *
 * That does mean the body is caller-supplied text sent to a billed endpoint,
 * so it is fenced accordingly: a signed-in citizen, who owns THIS report, and
 * a hard character cap. The report id is not decoration — it is what stops a
 * valid session from using this as an open text-to-speech service.
 *
 * A 204 means the provider has no voice (Gemini, OpenRouter). That is not an
 * error: the client falls back to the browser's own synthesis, which is what
 * this app did everywhere until it turned out to be silent on most desktops.
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

  // A missing report and someone else's report look identical from here.
  const report = await getOwnedReportRow(id, session.user.id);
  if (!report) {
    return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
  }

  let text: unknown;
  try {
    ({ text } = (await request.json()) as { text?: unknown });
  } catch {
    return NextResponse.json({ success: false, message: "Malformed request." }, { status: 400 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { success: false, message: "Nothing to read aloud." },
      { status: 400 },
    );
  }

  if (text.length > MAX_SPOKEN_CHARS) {
    return NextResponse.json(
      { success: false, message: "That is too long to read aloud." },
      { status: 413 },
    );
  }

  try {
    const audio = await speakText(text);

    // No voice on this provider — the browser should try instead.
    if (!audio) return new NextResponse(null, { status: 204 });

    return new NextResponse(new Uint8Array(audio.bytes), {
      status: 200,
      headers: {
        "Content-Type": audio.mimeType,
        "Content-Length": String(audio.bytes.byteLength),
        // Generated per request and never reused: caching it would keep a
        // recording of the citizen's own report in a shared proxy.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof SynthesisError) {
      /*
       * 204 rather than 5xx for a provider that simply cannot do this, so the
       * client takes the browser fallback instead of showing an error for
       * something it can still recover from.
       */
      if (error.reason === "not_configured") return new NextResponse(null, { status: 204 });

      return NextResponse.json(
        { success: false, message: "We couldn't read that aloud right now." },
        { status: 502 },
      );
    }
    throw error;
  }
}
