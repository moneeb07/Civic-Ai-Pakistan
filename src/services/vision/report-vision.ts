import "server-only";

import { GoogleGenAI, Type } from "@google/genai";

import {
  CIVIC_CATEGORIES,
  visionResultSchema,
  type VisionResult,
} from "@/lib/report/schema";
import { GEMINI_MODEL } from "@/services/gemini/model";

/*
 * Civic-issue image classification.
 *
 * A VisionProvider interface, not a bare function, so a different vision
 * model can be substituted later without touching any caller — the same
 * reasoning the CNIC extractor documents for its own shape. Gemini is the one
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

Respond with the structured fields only.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    detected: { type: Type.BOOLEAN },
    category: {
      type: Type.STRING,
      enum: [...CIVIC_CATEGORIES],
      nullable: true,
    },
    confidence: { type: Type.NUMBER },
    evidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    readable: { type: Type.BOOLEAN },
  },
  required: ["detected", "confidence", "evidence", "readable"],
};

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

class GeminiVisionProvider implements VisionProvider {
  async analyzeImage(bytes: Buffer, mimeType: string): Promise<VisionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new VisionAnalysisError("not_configured", "GEMINI_API_KEY is not configured.");
    }

    const client = new GoogleGenAI({ apiKey });

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
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getVisionProvider(): VisionProvider {
  return new GeminiVisionProvider();
}
