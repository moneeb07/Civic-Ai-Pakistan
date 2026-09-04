import "server-only";

import { aiClient } from "@/services/ai/client";
import { aiConfig } from "@/services/ai/model";

/*
 * Reading Urdu aloud to a citizen.
 *
 * WHY THIS IS NOT DONE IN THE BROWSER.
 * It was, and it did not work. `speechSynthesis` can only use voices the
 * DEVICE has installed, and Urdu is not installed by default anywhere that
 * matters here: desktop Chrome on Linux commonly has no Urdu voice, no Hindi
 * voice, and frequently no speech engine at all. The failure mode is the worst
 * one available — the API accepts the request, reports that it is speaking,
 * fires no error, and produces silence. A citizen who cannot read the screen
 * is then looking at a button that says "Stop" while nothing is happening.
 *
 * Generating the audio server-side makes the voice a property of the app
 * rather than of whatever the user happened to install. The browser path is
 * kept as a fallback for providers with no voice of their own, where a
 * device-installed voice is better than nothing — but it is no longer the
 * thing being relied on.
 *
 * The audio is not stored. It is generated, played, and forgotten: it is a
 * function of text the citizen is already looking at, so keeping it would add
 * a retention question for no benefit.
 */

export type SynthesisFailure = "not_configured" | "unsupported" | "upstream_error";

export class SynthesisError extends Error {
  constructor(
    readonly reason: SynthesisFailure,
    message: string,
  ) {
    super(message);
    this.name = "SynthesisError";
  }
}

export interface SpokenAudio {
  bytes: Buffer;
  mimeType: string;
}

/**
 * The longest utterance worth generating.
 *
 * The prompt this exists for is one sentence about a photograph plus a fixed
 * question — a few hundred characters. The cap is a spending guard, not a
 * style rule: this endpoint bills per character, so nothing should be able to
 * turn it into an open-ended text-to-speech service.
 */
export const MAX_SPOKEN_CHARS = 600;

/**
 * Speaks `text`, or returns null when the active provider has no voice.
 *
 * Null is the caller's cue to let the browser try instead — an ordinary
 * outcome on Gemini and OpenRouter, neither of which offers speech synthesis.
 */
export async function speakText(text: string): Promise<SpokenAudio | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const config = aiConfig();
  if (!config.ok) throw new SynthesisError("not_configured", config.reason);

  try {
    return await aiClient("speech-synthesise", config).speak({
      text: trimmed.slice(0, MAX_SPOKEN_CHARS),
    });
  } catch (error) {
    console.error(
      "[synthesis] upstream request failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    throw new SynthesisError("upstream_error", "The voice service could not be reached.");
  }
}
