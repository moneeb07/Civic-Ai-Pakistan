import "server-only";

import {
  CIVIC_CATEGORIES,
  visionResultSchema,
  type VisionResult,
} from "@/lib/report/schema";
import { aiClient } from "@/services/ai/client";
import { aiConfig, isAiConfigured } from "@/services/ai/model";

/*
 * Civic-issue image classification.
 *
 * A VisionProvider interface, not a bare function, so a different vision
 * model can be substituted later without touching any caller — the same
 * reasoning the CNIC extractor documents for its own shape. OpenAI is the one
 * real implementation today because it is already configured and working for
 * this account; there is no separate VISION_API_KEY to invent.
 */


const PROMPT = `You are looking at one photograph a Pakistani citizen took of a possible civic problem — something on a street, footpath, or public utility.

Your job is narrow: say what the photo actually shows, with honest uncertainty. You are not deciding whether to file a complaint, and you are not an authority on infrastructure policy.

Rules:
1. Only describe what is visibly, unambiguously present in the image. Do not infer a cause, a duration, prior accidents, who is responsible, or how many people are affected — none of that is visible in a single photo.
2. "category" must be exactly one of: ${CIVIC_CATEGORIES.join(", ")}. Use OTHER when the photo shows a plausible civic issue that doesn't fit the other categories. Use null only when "detected" is false.
3. "confidence" (0 to 1) is your honest confidence that the category you chose is correct — not confidence that a problem exists in general. A photo that's ambiguous between two categories should score low, not be forced into one.
4. "detected" is true only if the photo plausibly shows an actual civic infrastructure problem (road, footpath, drainage, lighting, garbage, water, public property). A photo of something unrelated (a person, a receipt, an animal, a random object) must have detected=false.
5. "evidence" is 1-3 short, literal phrases describing what you actually see (e.g. "depression in the road surface with exposed gravel", "standing water pooling near a drain") — never a conclusion, a measurement you can't verify, or a guess about severity.
6. "readable" is false if the image is too dark, too blurred, or too zoomed/cropped to say anything reliable about it at all. If readable is false, detected must also be false.
7. Never invent a location, a road name, a sector, a city, or an authority — none of that is in the photo.
8. "summaryUr" is ONE plain Urdu sentence, in the Urdu script, saying what the photo shows — the way you would describe it out loud to the person who took it. It is read aloud to a citizen who may not read English, so: no English words, no transliteration, no category codes, no bullet points, no confidence figures. Example: "سڑک پر ایک گڑھا ہے جس میں پانی کھڑا ہے۔" It must say the same thing as "evidence" and claim nothing more. Use null only when detected is false.

Respond with the structured fields only.`;

/*
 * OpenAI structured output, in strict mode.
 *
 * Strict mode has two rules Gemini's schema did not: every property must be
 * listed in `required`, and nullability is expressed as a type union rather
 * than a `nullable` flag. So "category" is `["string", "null"]` and appears in
 * required — the model must always emit the key, and is allowed to emit null
 * for it, which is exactly the old contract said a different way.
 */
const responseSchema = {
  name: "civic_vision_result",
  schema: {
    type: "object",
    properties: {
      detected: { type: "boolean" },
      category: { type: ["string", "null"], enum: [...CIVIC_CATEGORIES, null] },
      confidence: { type: "number" },
      evidence: { type: "array", items: { type: "string" } },
      readable: { type: "boolean" },
      summaryUr: { type: ["string", "null"] },
    },
    required: ["detected", "category", "confidence", "evidence", "readable", "summaryUr"],
    additionalProperties: false,
  },
} as const;

/** Parses without throwing, so a validate predicate can stay an expression. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type VisionFailure = "not_configured" | "upstream_error" | "malformed_response";

export class VisionAnalysisError extends Error {
  constructor(readonly reason: VisionFailure, message: string) {
    super(message);
    this.name = "VisionAnalysisError";
  }
}

export interface VisionProvider {
  analyzeImage(bytes: Buffer, mimeType: string): Promise<VisionResult>;
}

class AiVisionProvider implements VisionProvider {
  async analyzeImage(bytes: Buffer, mimeType: string): Promise<VisionResult> {
    const config = aiConfig();
    if (!config.ok) {
      throw new VisionAnalysisError("not_configured", config.reason);
    }

    const client = aiClient("report-vision", config);

    let rawText: string | undefined;
    try {
      rawText = await client.complete({
        task: "vision",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` },
              },
            ],
          },
        ],
        schema: responseSchema,
        temperature: 0,
        // A reply that will not survive the Zod parse below is a failed rung,
        // so the client moves to the next model rather than surfacing an error.
        validate: (text) => visionResultSchema.safeParse(safeJson(text)).success,
      });
    } catch (error) {
      console.error(
        "[report-vision] upstream request failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      throw new VisionAnalysisError("upstream_error", "The vision service could not be reached.");
    }

    if (!rawText) {
      throw new VisionAnalysisError("malformed_response", "The vision service returned an empty response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new VisionAnalysisError("malformed_response", "The vision service returned invalid JSON.");
    }

    const result = visionResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new VisionAnalysisError("malformed_response", "The vision service returned unexpected fields.");
    }

    // Belt and braces beyond the schema: never let a "confident" detection
    // survive an unreadable photo, whatever the model claimed about detected.
    if (!result.data.readable) {
      return { ...result.data, detected: false, category: null, confidence: 0 };
    }

    return result.data;
  }
}

export function isVisionConfigured(): boolean {
  return isAiConfigured();
}

export function getVisionProvider(): VisionProvider {
  return new AiVisionProvider();
}
