import "server-only";

import { Type } from "@google/genai";
import { z } from "zod";

import type { CnicSide, VisionReadability } from "@/lib/cnic/validation";
import { geminiClient } from "@/services/gemini/client";
import { GEMINI_MODEL } from "@/services/gemini/model";

/*
 * "Can this image actually be read?" — asked of one image, before anything is
 * extracted from it.
 *
 * Separate from cnic-extractor.ts on purpose. Extraction asks "what does the
 * card say"; this asks "is this photograph fit to be read at all". Merging
 * them is what produced the defect being fixed: a blurred image would return
 * a plausible-looking set of fields, and the absence of an explicit
 * readability verdict meant nothing downstream ever refused it.
 *
 * The distinction the whole prompt turns on is VISIBLE AND READABLE versus
 * POSSIBLY GUESSABLE. A model that has seen a million CNICs can complete the
 * layout of one it cannot actually see — and every one of those completions is
 * a wrong digit in somebody's national identity number.
 */


const VALIDATION_PROMPT = `You are validating a photograph of a Pakistani CNIC (Computerised National Identity Card) to decide whether it is fit for reliable identity-document extraction. You are NOT being asked to transcribe the card.

Your single most important instruction: judge what you can ACTUALLY SEE in this image. Never infer, autocomplete, or reconstruct characters that are not visually resolvable. A field you could guess from the layout of a typical CNIC, but cannot actually read in THIS photograph, is UNREADABLE.

Report per-field confidence honestly and strictly. For each field, "confidence" means: how certain are you that you can read every character of this field correctly from this image, without guessing. If the strokes are smeared, the resolution is too low to separate characters, glare covers it, or it is cut off, the confidence is low and the value is null — no matter how obvious the field's position is.

CARD VARIANTS
Pakistani identity cards exist in several legitimate layouts — the older standard CNIC, the Smart CNIC, and the newer QR-code card — and older cards remain valid until they expire. Identify fields SEMANTICALLY, by their printed labels and their meaning. Do not assume a field sits at a fixed position, and do not reject a card merely because its layout differs from the most common one.

SIDE
Decide which side this image shows, from what is actually visible:
- "front" — carries the holder's photograph, Name, Father/Husband Name, Gender, Country of Stay, Identity Number, Date of Birth, Date of Issue, Date of Expiry.
- "back" — carries Present Address (موجودہ پتہ) and Permanent Address (مستقل پتہ), the signature, the fingerprint box, and on newer cards a QR code. It has no photograph of the holder.
- null — you genuinely cannot tell.
Report the side you SEE, never the side you assume you were given.

READABILITY — choose exactly one:
- "readable": every field the card prints on this side can be read character by character with confidence.
- "partially_readable": the card is identifiable and some fields read cleanly, but at least one printed field cannot be read reliably.
- "not_readable": the image does not carry enough visual information to extract identity data — heavy blur, severe glare, too small, too dark, badly cut off, or motion-smeared.

QUALITY FLAGS — report what you observe, independently of readability:
- blurDetected: characters are smeared or softened beyond crisp resolution.
- glareDetected: a reflection or hotspot covers part of the printed area.
- cropped: any part of the card is outside the image.
- perspectiveIssue: the card is angled or skewed enough to distort the text.

FIELD CONFIDENCE
Score each field 0 to 1. Score a field you cannot read, or that this side does not print, as 0. Be strict: 0.8 means a real chance of a wrong character in somebody's national identity number, and that is not good enough.

URDU
Urdu is held to exactly the same standard as everything else. A smudged or ambiguous Urdu word is unreadable — do not choose the most likely word. Do not transliterate.

OVERALL CONFIDENCE
"confidence" is your overall confidence that this photograph is fit for reliable extraction, 0 to 1. An image you would not stake a citizen's identity record on scores below 0.7.

If the image is not a Pakistani identity card at all — a random photograph, a blank frame, a different document — set isPakistaniCnic to false and readability to "not_readable".`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    isPakistaniCnic: { type: Type.BOOLEAN },
    side: { type: Type.STRING, nullable: true },
    readability: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    blurDetected: { type: Type.BOOLEAN },
    glareDetected: { type: Type.BOOLEAN },
    cropped: { type: Type.BOOLEAN },
    perspectiveIssue: { type: Type.BOOLEAN },
    fieldConfidence: {
      type: Type.OBJECT,
      properties: {
        cnicNumber: { type: Type.NUMBER },
        name: { type: Type.NUMBER },
        fatherOrHusbandName: { type: Type.NUMBER },
        gender: { type: Type.NUMBER },
        dateOfBirth: { type: Type.NUMBER },
        dateOfIssue: { type: Type.NUMBER },
        dateOfExpiry: { type: Type.NUMBER },
        presentAddress: { type: Type.NUMBER },
        permanentAddress: { type: Type.NUMBER },
      },
    },
    unreadableFields: { type: Type.ARRAY, items: { type: Type.STRING } },
    userInstruction: { type: Type.STRING, nullable: true },
  },
  /*
   * fieldConfidence is REQUIRED, not optional.
   *
   * Left optional, the model simply omitted it — and since a field with no
   * confidence counts as unread, a card it had just called "readable" at 0.95
   * was rejected with every required field listed as unreadable. Demanding the
   * map is the difference between the model declining to answer and the model
   * saying the field is illegible.
   */
  required: ["isPakistaniCnic", "readability", "confidence", "fieldConfidence"],
};

/*
 * The model's output is untrusted input. Anything malformed collapses to the
 * PESSIMISTIC value, never the optimistic one: a missing confidence is 0, a
 * missing flag is "problem present". A parser that defaults to "fine" would
 * turn a garbled response into an accepted scan.
 */
const score = z.number().min(0).max(1).catch(0).optional();

const payloadSchema = z.object({
  isPakistaniCnic: z.boolean().catch(false),
  side: z.enum(["front", "back"]).nullable().optional().catch(null),
  readability: z
    .enum(["readable", "partially_readable", "not_readable"])
    .catch("not_readable"),
  confidence: z.number().min(0).max(1).catch(0),
  blurDetected: z.boolean().catch(true),
  glareDetected: z.boolean().catch(false),
  cropped: z.boolean().catch(false),
  perspectiveIssue: z.boolean().catch(false),
  fieldConfidence: z
    .object({
      cnicNumber: score,
      name: score,
      fatherOrHusbandName: score,
      gender: score,
      dateOfBirth: score,
      dateOfIssue: score,
      dateOfExpiry: score,
      presentAddress: score,
      permanentAddress: score,
    })
    .nullable()
    .optional(),
  userInstruction: z.string().max(200).nullable().optional(),
});

export class CnicValidationError extends Error {
  constructor(
    readonly reason:
      | "not_configured"
      | "upstream_error"
      | "malformed_response"
      /*
       * The API's own quota, not a fault in the image.
       *
       * Worth its own reason because it is the failure a citizen is most
       * likely to actually hit — the free tier allows 20 requests a minute and
       * one registration spends three — and because reporting it as an
       * unreadable photograph sends somebody off to re-photograph a perfectly
       * good card that was never the problem.
       */
      | "rate_limited"
      /*
       * The DAILY free-tier allowance is gone. Distinct from rate_limited
       * because the advice is completely different: one is "wait a moment",
       * the other is "this will not work again until tomorrow, or until
       * billing is enabled".
       */
      | "quota_exhausted",
    message: string,
    /** Seconds the API asked us to wait, when it says. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "CnicValidationError";
  }
}

export interface ValidationImage {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Asks the model whether one image is fit to extract from.
 *
 * `expectedSide` is passed as CONTEXT, not as an instruction to agree with:
 * the prompt asks the model to report the side it sees, and the caller
 * compares. Telling it "this is the front" and then asking "which side is
 * this" would invite it to confirm what it was told.
 */
export async function validateCnicImage(
  image: ValidationImage,
  expectedSide: CnicSide,
): Promise<VisionReadability> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new CnicValidationError("not_configured", "GEMINI_API_KEY is not configured.");
  }

  const client = geminiClient("cnic-validate", apiKey);

  const request = () =>
    client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: VALIDATION_PROMPT },
            {
              text: `The citizen was asked to photograph the ${expectedSide} of the card. Report the side you actually see.`,
            },
            {
              inlineData: {
                mimeType: image.mimeType,
                data: image.bytes.toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        // A judgement, not a creative task.
        temperature: 0,
      },
    });

  /*
   * Retried, because the upstream is genuinely flaky.
   *
   * A transient 5xx or a dropped connection was surfacing to the citizen as
   * "Picture is not readable" — telling somebody holding a perfectly clear
   * card that their card is the problem. The two failures are not the same
   * thing and must never share a message, so the call is retried here before
   * anything is concluded about the image.
   *
   * Three attempts with a short backoff: enough to ride out a blip, short
   * enough that somebody is not left staring at a spinner.
   */
  let rawText: string | undefined;
  let lastError: unknown;
  let rateLimited = false;
  let dailyQuota = false;
  let retryAfterSeconds: number | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await request();
      rawText = response.text;
      break;
    } catch (error) {
      lastError = error;

      /*
       * A 429 is a quota decision, not a transient blip, and hammering it
       * makes the quota worse. The API tells us how long to wait; that is
       * reported to the citizen rather than burned in a retry loop they are
       * left waiting through.
       */
      const message = error instanceof Error ? error.message : "";
      if (message.includes('"code":429') || message.includes("RESOURCE_EXHAUSTED")) {
        rateLimited = true;

        /*
         * A DAILY cap is not something to wait out.
         *
         * The API returns a `retryDelay` of half a minute even when the
         * exhausted quota is `GenerateRequestsPerDayPerProjectPerModel`, and
         * repeating that told people to "wait about 45 seconds and check
         * again" for a limit that resets tomorrow. They waited, retried,
         * failed, and reasonably concluded the app was broken.
         *
         * So the quota's own id decides the wording: a per-minute limit gets
         * the countdown, a per-day limit gets the truth.
         */
        dailyQuota = /PerDay/i.test(message);

        if (!dailyQuota) {
          const match = /retry in ([\d.]+)s/i.exec(message);
          if (match) retryAfterSeconds = Math.ceil(Number(match[1]));
        }
        break;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }

  if (rateLimited) {
    console.error("[cnic-validate] rate limited by the API");
    throw new CnicValidationError(
      dailyQuota ? "quota_exhausted" : "rate_limited",
      "The scanning service is over its request limit.",
      retryAfterSeconds,
    );
  }

  if (rawText === undefined) {
    // The shape of the failure, never the image or its contents.
    console.error(
      "[cnic-validate] upstream request failed after retries:",
      lastError instanceof Error ? lastError.name : "unknown error",
    );
    throw new CnicValidationError("upstream_error", "The validation service failed.");
  }

  if (!rawText) {
    throw new CnicValidationError("malformed_response", "Empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new CnicValidationError("malformed_response", "Invalid JSON.");
  }

  const result = payloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new CnicValidationError("malformed_response", "Unexpected fields.");
  }

  const data = result.data;
  const fieldConfidence: Record<string, number> = {};
  for (const [field, value] of Object.entries(data.fieldConfidence ?? {})) {
    if (typeof value === "number") fieldConfidence[field] = value;
  }

  return {
    isPakistaniCnic: data.isPakistaniCnic,
    observedSide: data.side ?? null,
    readability: data.readability,
    confidence: data.confidence,
    fieldConfidence,
    blurDetected: data.blurDetected,
    glareDetected: data.glareDetected,
    cropped: data.cropped,
    perspectiveIssue: data.perspectiveIssue,
  };
}

export function isValidatorConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
