import "server-only";


import {
  type TranscriptionResult,
} from "@/lib/report/schema";
import { aiClient } from "@/services/ai/client";
import { aiConfig, isAiConfigured } from "@/services/ai/model";

/*
 * Speech-to-text for a spoken complaint description.
 *
 * A SpeechToTextProvider interface for the same reason every other AI step in
 * this app has one: the caller does not change when the vendor does. Which
 * provider actually answers is decided by AI_PROVIDER and resolved inside the
 * client — chosen over the browser's built-in Web Speech API specifically
 * because Web Speech's language support for Urdu, Punjabi, Pashto, Sindhi,
 * Balochi and Saraiki is inconsistent across browsers, and this app promises
 * to preserve exactly what was said, not approximate it.
 */


/*
 * The vocabulary hint, and why it is written in Urdu script.
 *
 * A transcription `prompt` is a STYLE and VOCABULARY sample, not an
 * instruction channel — the model does not follow directions given here the
 * way a chat model would. What it DOES do is continue in the register it is
 * shown. So the hint is itself written in Urdu script, with the civic words
 * this app actually receives: shown Urdu, the model keeps producing Urdu
 * instead of drifting into a Roman transliteration that is neither language.
 *
 * That drift was the original complaint. Naming the language (in the client)
 * decides how the audio is decoded; this decides what the output looks like.
 * Both are needed — the language code alone still leaves the model free to
 * romanise, and a hint alone still leaves it guessing which language it heard.
 *
 * The English clause stays because code-switching is genuinely constant here:
 * a citizen says "streetlight" and "sewerage" in English mid-Urdu-sentence,
 * and forcing those into Urdu script would be its own kind of mangling.
 */
const TRANSCRIPTION_HINT =
  "ایک پاکستانی شہری اپنے علاقے کا مسئلہ بتا رہا ہے: سڑک میں گڑھا، کچرا، ٹوٹی ہوئی " +
  "اسٹریٹ لائٹ، پانی کی لیکیج، سیوریج کا مسئلہ، کھلا مین ہول، ٹوٹا ہوا فٹ پاتھ۔ " +
  "بات چیت اردو میں ہے اور بیچ میں انگریزی الفاظ بھی آ سکتے ہیں۔ " +
  "A Pakistani citizen describing a civic problem, speaking Urdu and " +
  "code-switching into English for words like streetlight, sewerage and manhole.";

export type TranscriptionFailure = "not_configured" | "upstream_error" | "malformed_response";

export class TranscriptionError extends Error {
  constructor(readonly reason: TranscriptionFailure, message: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export interface SpeechToTextProvider {
  transcribe(bytes: Buffer, mimeType: string): Promise<TranscriptionResult>;
}

class AiSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(bytes: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const config = aiConfig();
    if (!config.ok) {
      throw new TranscriptionError("not_configured", config.reason);
    }

    const client = aiClient("speech-transcribe", config);

    let spoken: { text: string; language: string | null };
    try {
      spoken = await client.transcribe({ bytes, mimeType, hint: TRANSCRIPTION_HINT });
    } catch (error) {
      console.error(
        "[transcription] upstream request failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      throw new TranscriptionError("upstream_error", "The transcription service could not be reached.");
    }

    const transcript = spoken.text.trim();

    /*
     * A NOTE ON `confident`, because its meaning genuinely changed here.
     *
     * The original provider was asked to judge its own certainty and report
     * it as a field. The model is now asked for the transcript alone, so no
     * such judgment comes back. Rather than invent a confidence score and
     * dress a guess up as the model's opinion, this derives the one thing
     * that can honestly be observed: whether anything intelligible came back
     * at all.
     *
     * That preserves what the flag is actually USED for. The route treats
     * "no transcript or not confident" as "we couldn't understand you, please
     * type it instead", and silence or noise still lands there, because these
     * models return an empty or near-empty string for both.
     */
    const confident = transcript.length > 0;

    return {
      transcript: confident ? transcript : null,
      /*
       * What the model was TOLD to expect, not a detection it performed —
       * which is the honest label, since naming the language up front is
       * exactly how this stopped mangling Urdu. Null when nothing usable came
       * back, so an empty transcript is never filed as confidently Urdu.
       */
      language: confident ? spoken.language : null,
      confident,
    };
  }
}

export function isSpeechToTextConfigured(): boolean {
  return isAiConfigured();
}

export function getSpeechToTextProvider(): SpeechToTextProvider {
  return new AiSpeechToTextProvider();
}
