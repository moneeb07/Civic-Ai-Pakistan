import "server-only";

import { GoogleGenAI, Type } from "@google/genai";

import {
  CIVIC_CATEGORIES,
  SEVERITIES,
  generatedComplaintSchema,
  type CivicCategory,
  type GeneratedComplaint,
} from "@/lib/report/schema";

/*
 * Turns everything a citizen provided — a category, what the vision step
 * observed, what they said or typed, where they are — into a short, clear
 * complaint title/description/severity. Nothing here is invented: every rule
 * in the prompt exists to stop the model filling a gap with a plausible-
 * sounding guess (an accident count, a duration, a cause) that the citizen
 * never actually said and the photo never actually showed.
 *
 * A ComplaintGenerationProvider interface for the same reason as the other
 * providers in this app: one real Gemini-backed implementation today, room
 * to swap it without touching any caller.
 */

const MODEL = "gemini-3.6-flash";

export interface ComplaintGenerationInput {
  category: CivicCategory;
  /** Short, literal phrases from the vision step — what was actually visible in the photo. */
  visionEvidence: string[];
  /** The citizen's own words — spoken (transcribed) or typed. Original language preserved. */
  citizenDescription: string;
  /** Human-readable location, if one was confirmed. */
  locationLabel: string | null;
}

const PROMPT_TEMPLATE = (input: ComplaintGenerationInput) => `You are turning a Pakistani citizen's civic complaint into a short, clear report. You are given only what the citizen and the earlier image analysis actually provided — nothing else exists.

Category (already confirmed by the citizen): ${input.category}

What the photo shows (from image analysis, already confirmed by the citizen):
${input.visionEvidence.length > 0 ? input.visionEvidence.map((e) => `- ${e}`).join("\n") : "(no specific visual details recorded)"}

What the citizen said, in their own words (may be in Urdu, English, or mixed):
"${input.citizenDescription}"

Location: ${input.locationLabel ?? "(not provided)"}

Write:
1. "title" — a short (under 12 words) plain-English title naming the problem and, if a location was actually given above, where. Do NOT name a location that wasn't given above. Example: "Large pothole on road" or, only if a location string was actually provided, "Large pothole on road in G-10".
2. "description" — 1-3 plain English sentences describing the problem, grounded ONLY in the photo evidence and what the citizen said above. Translate/rephrase informal or mixed-language speech into clear English, but do not add any fact that isn't in the evidence or the citizen's own words.
3. "severity" — your best-effort estimate, one of ${SEVERITIES.join(", ")}, based only on what's actually described (e.g. a large hazard blocking a road vs. a minor cosmetic issue). This is a helpful estimate for the citizen to review and change, not an official priority ranking.

STRICT RULES — do not violate these:
- Never invent a cause ("likely caused by recent rains").
- Never invent a duration ("has been there for weeks").
- Never invent measurements ("approximately 2 feet wide") unless the citizen stated a number.
- Never invent how many people or vehicles are affected.
- Never invent a road name, sector, or address not given in the Location field above.
- Never invent that anyone was injured or that an accident occurred, unless the citizen said so.
- If the citizen's own words contradict or add nothing beyond the photo evidence, prefer their words — they are the one who saw it in person.

Respond with the structured fields only.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    severity: { type: Type.STRING, enum: [...SEVERITIES] },
  },
  required: ["title", "description", "severity"],
};

export type ComplaintGenerationFailure =
  | "not_configured"
  | "upstream_error"
  | "malformed_response";

export class ComplaintGenerationError extends Error {
  constructor(readonly reason: ComplaintGenerationFailure, message: string) {
    super(message);
    this.name = "ComplaintGenerationError";
  }
}

export interface ComplaintGenerationProvider {
  generate(input: ComplaintGenerationInput): Promise<GeneratedComplaint>;
}

class GeminiComplaintGenerationProvider implements ComplaintGenerationProvider {
  async generate(input: ComplaintGenerationInput): Promise<GeneratedComplaint> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ComplaintGenerationError("not_configured", "GEMINI_API_KEY is not configured.");
    }

    if (!CIVIC_CATEGORIES.includes(input.category)) {
      throw new ComplaintGenerationError("malformed_response", "Unknown category.");
    }

    const client = new GoogleGenAI({ apiKey });

    let rawText: string | undefined;
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: PROMPT_TEMPLATE(input) }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.2,
        },
      });
      rawText = response.text;
    } catch (error) {
      console.error(
        "[complaint-generator] upstream request failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      throw new ComplaintGenerationError(
        "upstream_error",
        "The complaint generation service could not be reached.",
      );
    }

    if (!rawText) {
      throw new ComplaintGenerationError(
        "malformed_response",
        "The complaint generation service returned an empty response.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new ComplaintGenerationError(
        "malformed_response",
        "The complaint generation service returned invalid JSON.",
      );
    }

    const result = generatedComplaintSchema.safeParse(parsed);
    if (!result.success) {
      throw new ComplaintGenerationError(
        "malformed_response",
        "The complaint generation service returned unexpected fields.",
      );
    }

    return result.data;
  }
}

export function isComplaintGenerationConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getComplaintGenerationProvider(): ComplaintGenerationProvider {
  return new GeminiComplaintGenerationProvider();
}
