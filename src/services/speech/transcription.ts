import "server-only";

import { Type } from "@google/genai";

import {
  transcriptionResultSchema,
  type TranscriptionResult,
} from "@/lib/report/schema";
import { geminiClient } from "@/services/gemini/client";
import { GEMINI_MODEL } from "@/services/gemini/model";

/*
 * Speech-to-text for a spoken complaint description.
 *
 * A SpeechToTextProvider interface for the same reason every other AI step in
 * this app has one: a real transcription vendor could replace this later
 * without the caller changing. Gemini's multimodal audio input is the one
 * real implementation — chosen over the browser's built-in Web Speech API
 * specifically because Web Speech's language support for Urdu, Punjabi,
 * Pashto, Sindhi, Balochi and Saraiki is inconsistent across browsers, and
 * this app promises to preserve exactly what was said, not approximate it.
 */


const PROMPT = `You are transcribing an audio recording of a Pakistani citizen describing a civic problem out loud — a pothole, garbage, a broken streetlight, or similar.

Rules:
1. Transcribe EXACTLY what is said, in the language and script it was actually spoken in. If the citizen spoke Urdu, transcribe in Urdu script — never translate to English, never transliterate. If they spoke English, transcribe in English. If they code-switched between languages mid-sentence (very common in Pakistan), transcribe it exactly as spoken, mixed.
2. Do not clean up, formalize, or rephrase what was said. Do not add words that weren't spoken, even if they would "complete" the sentence.
3. If the recording is silent, inaudible, too noisy, or you cannot make out real words with confidence, return null for "transcript" — do not guess at words you aren't sure of.
4. "language" is your best-effort NAME for the language spoken (e.g. "Urdu", "English", "Punjabi", "mixed Urdu/English") — purely informational, it never changes the transcript itself.
5. "confident" is true only if you are sure the transcript accurately captures what was said start to finish.

Respond with the structured fields only.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING, nullable: true },
    language: { type: Type.STRING, nullable: true },
    confident: { type: Type.BOOLEAN },
  },
  required: ["confident"],
};

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

class GeminiSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(bytes: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new TranscriptionError("not_configured", "GEMINI_API_KEY is not configured.");
    }

    const client = geminiClient("speech-transcribe", apiKey);

    let rawText: string | undefined;
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType, data: bytes.toString("base64") } },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0,
        },
      });
      rawText = response.text;
    } catch (error) {
      console.error(
        "[transcription] upstream request failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      throw new TranscriptionError("upstream_error", "The transcription service could not be reached.");
    }

    if (!rawText) {
      throw new TranscriptionError("malformed_response", "The transcription service returned an empty response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new TranscriptionError("malformed_response", "The transcription service returned invalid JSON.");
    }

    const result = transcriptionResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new TranscriptionError("malformed_response", "The transcription service returned unexpected fields.");
    }

    return result.data;
  }
}

export function isSpeechToTextConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getSpeechToTextProvider(): SpeechToTextProvider {
  return new GeminiSpeechToTextProvider();
}
