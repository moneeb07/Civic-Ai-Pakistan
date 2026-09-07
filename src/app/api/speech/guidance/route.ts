import { NextResponse } from "next/server";

import { getDictionary } from "@/lib/i18n";
import { getOrCreateRegistrationSession } from "@/lib/registration/session";
import { SynthesisError, speakText } from "@/services/speech/synthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/speech/guidance  { phrase }  ->  audio/mpeg
 *
 * Reads a registration step's instruction aloud, in Urdu, using the provider's
 * voice rather than the device's.
 *
 * WHY THIS EXISTS.
 * Assisted Mode spoke through the browser's `speechSynthesis`, and that only
 * ever worked by accident. It can use only voices the DEVICE has installed,
 * and Urdu is installed almost nowhere by default — not on desktop Chrome on
 * Linux, not on most Windows machines. The failure is silent in the worst
 * sense: the API accepts the utterance, reports that it is speaking, fires no
 * error, and produces nothing. A citizen sees "Voice guidance on" and hears
 * silence, which is exactly what happened on the deployed site.
 *
 * Writing the phrases in Urdu script made that worse rather than better. A
 * Roman-Urdu string at least got mangled aloud by an English voice; an Urdu
 * one has nothing to fall back to.
 *
 * WHY A PHRASE, NOT FREE TEXT.
 * This endpoint bills per character and is reachable before anyone has signed
 * in — the citizen is midway through creating an account, so there is no user
 * to attribute it to. Accepting arbitrary text there would be an open
 * text-to-speech service. Instead the body must match one of the fixed
 * instructions in the dictionary: the client says WHICH sentence to read, and
 * the server decides what that sentence is. Nothing a citizen types, and no
 * value read off their CNIC, can be routed through here.
 */
// Typed as Set<string> on purpose: the dictionary is `as const`, so its values
// are literal types, and a Set of those would refuse `.has()` on any ordinary
// string — including the one that just arrived in the request body.
const ALLOWED_PHRASES = new Set<string>(Object.values(t.voice));

export async function POST(request: Request) {
  /*
   * An onboarding session must exist. It is not identity — nobody has an
   * account yet — but it does mean the caller came through the registration
   * flow rather than straight at this URL.
   */
  await getOrCreateRegistrationSession();

  let phrase: unknown;
  try {
    ({ phrase } = (await request.json()) as { phrase?: unknown });
  } catch {
    return NextResponse.json({ success: false, message: "Malformed request." }, { status: 400 });
  }

  if (typeof phrase !== "string" || !ALLOWED_PHRASES.has(phrase)) {
    return NextResponse.json(
      { success: false, message: "That is not something this endpoint reads aloud." },
      { status: 400 },
    );
  }

  try {
    const audio = await speakText(phrase);

    /*
     * 204 means the active provider has no voice of its own — ordinary on
     * Gemini and OpenRouter. The client then lets the device try, which is
     * better than nothing on a machine that does happen to have an Urdu voice.
     */
    if (!audio) return new NextResponse(null, { status: 204 });

    return new NextResponse(new Uint8Array(audio.bytes), {
      status: 200,
      headers: {
        "Content-Type": audio.mimeType,
        "Content-Length": String(audio.bytes.byteLength),
        // Generated per request and never stored; caching it would only put a
        // recording of the app's own voice in a shared proxy somewhere.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof SynthesisError && error.reason === "not_configured") {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(
      { success: false, message: "The voice service could not be reached." },
      { status: 502 },
    );
  }
}
