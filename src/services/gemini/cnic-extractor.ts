import "server-only";

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODEL } from "@/services/gemini/model";

/*
 * CNIC extraction service.
 *
 * This is the ONLY place in CivicAI that talks to Gemini. It is server-only:
 * the API key never reaches the browser, and no UI component imports this file.
 *
 * What this does NOT do: prove that a CNIC is authentic. It reads text off an
 * image. Callers must phrase results as "extracted", never "verified".
 */


/*
 * A NADRA CNIC's back side prints Present Address and Permanent Address as two
 * free-text Urdu blocks — not as separate labelled House/Street/Sector/District
 * fields the way the front's identity fields are. That makes the address a
 * genuinely harder read: the model has to segment a sentence into parts as
 * well as read it. The prompt asks for the raw line as well as a best-effort
 * breakdown, so nothing is lost if the split is wrong — the citizen still sees
 * exactly what was printed.
 *
 * The address comes back twice: once in the script it was printed in (Urdu
 * stays Urdu) and once transliterated into Roman Urdu. The original is what
 * the citizen sees and what gets stored; the Roman mirror exists for the
 * Latin-script contexts around it (search, addressing a report to a council)
 * and is never a translation of the meaning.
 *
 * Per-field confidence is requested explicitly rather than inferred from a
 * single overall number, because the failure that matters here is one wrong
 * digit in an otherwise clean read — see lib/cnic-confidence.ts for what is
 * done with it.
 */
const EXTRACTION_PROMPT = `You are reading photographs of both sides of a Pakistani CNIC (Computerised National Identity Card). You may be given one image (front only) or two images (front and back).

Extract ONLY information that is clearly printed and legible in the images.

ACCURACY IS THE ONLY PRIORITY. A null is always a better answer than a guess. You are not being scored on how many fields you fill.

Rules, in order of importance:
1. If a field is not visible, is cut off, is blurred, or you are not fully confident of EVERY character in it, return null for that field.
2. Never invent, infer, complete, or "correct" any value. Do not reconstruct a partially visible number, name or address.
3. Never substitute a similar-looking character for one you cannot resolve. If you cannot tell 3 from 8, or ک from گ, or ب from ی, the field is null — do not pick the more likely one.
4. Do not infer any information that is not actually printed on the card. If an address is not printed on the back, leave every address field null — do not guess a city or district from the CNIC number's region prefix.
5. Return the CNIC number exactly as printed, in the format 00000-0000000-0. Every one of the 13 digits must be individually legible, or the field is null.
6. Return dates exactly as printed on the card, in DD.MM.YYYY format.
7. Gender must be exactly "Male" or "Female" as printed on the card, or null.
8. Nationality only if the word is actually printed on the card.
9. Report "readable" as false if BOTH images are too blurred, too dark, glared, or angled to read reliably. If only one side is unreadable, still return what you can read from the other side.
9a. Separately, report "frontReadable" and "backReadable": each is true only if THAT specific image was clear enough to read reliably, false if that image was too blurred, too dark, glared, or angled, and null if that image was not provided at all (a front-only submission has backReadable = null, never false). Judge each side purely on its own image quality, independent of whether you could actually read every field on it — a side can be perfectly READABLE while still printing no address, for example.
10. "confidence" is your overall confidence that the values you returned are correct, from 0 to 1.
11. "fieldConfidence" carries a separate 0-1 score for each identity field, meaning: how sure are you that every character of THIS field is exactly right. Be honest and be strict — a field you are 80% sure of is a field with a real chance of a wrong digit in someone's national ID number. Score a field you returned as null at 0.

Address fields (usually on the back, printed in Urdu as "Present Address" / موجودہ پتہ and "Permanent Address" / مستقل پتہ):
12. These are printed as ONE free-text line each, not as separate labelled fields.
13. PRESERVE THE ORIGINAL SCRIPT. The top-level address fields ("raw", "houseNumber", "streetOrMohalla", "sector", "district", "city") must be returned in the script they are printed in. If the card prints the address in Urdu, return Urdu text, in Urdu script, exactly as printed. Do not transliterate it and do not translate it there.
    - Correct: "مکان نمبر 123، گلی نمبر 5، محلہ رحمان پورہ، ضلع ملتان"
    - Wrong (transliterated): "Makan No 123, Gali No 5, Mohalla Rehman Pura, Zila Multan"
    - Wrong (translated): "House No 123, Street No 5, Rehman Pura Neighbourhood, Multan District"
    - Anything printed on the card in English or as digits stays exactly as printed.
14. Separately, fill the "roman" object with the SAME address TRANSLITERATED into Roman Urdu — the sounds, never the meaning. This is a phonetic mirror of the Urdu above, the way a Pakistani citizen would type it on a phone keyboard.
    - Correct (transliteration): "Makan No 123, Gali No 5, Mohalla Rehman Pura, Zila Multan"
    - Wrong (translation): "House No 123, Street No 5, Rehman Pura Neighbourhood, Multan District"
    - Never substitute an English word for an Urdu one (گلی is "Gali", never "Street"; مکان is "Makan", never "House"; محلہ is "Mohalla", never "Neighbourhood" or "Area"; ضلع is "Zila", never "District").
    - If the address was printed in English to begin with, repeat it unchanged in "roman".
15. Make your OWN best-effort split of the line into: houseNumber (house/flat number as it reads), streetOrMohalla (the gali/mohalla/street name or number), sector (only if it is an Islamabad-style sector code like "G-11" or "F-8/2" — leave null otherwise), district (district/tehsil/zila name), city (the city or town name). Split the Urdu and the Roman the same way, so the two line up field for field.
16. Every part you cannot confidently identify in the text must be null. Do not force a value into a field just to fill it.
17. Urdu is held to exactly the same standard as everything else. If a word in the Urdu address is smudged, cut off, or ambiguous, do not choose the most likely word — leave the field null and lower that block's confidence.
18. Each address block carries its own "confidence" from 0 to 1: how sure you are that you have read that address correctly, character by character.
19. If the card shows no address at all, set both presentAddress and permanentAddress to null.
20. If present and permanent address are identical on the card, still return both blocks — do not assume, always read what is actually printed for each.


SIDE IDENTIFICATION — do this before reading any field:
21. For each image you are given, decide which side of the CNIC it actually shows, and report it in "frontImageSide" (for the first image) and "backImageSide" (for the second image; null if only one image was provided).
    - "front" — the side carrying the photograph of the person, Name, Father Name, Gender, Country of Stay, Identity Number, Date of Birth, Date of Issue and Date of Expiry.
    - "back" — the side carrying Present Address (موجودہ پتہ) and Permanent Address (مستقل پتہ), the holder's signature and the fingerprint box. It has no photograph of the person.
    - "unknown" — it is not a CNIC at all, or too unclear to tell which side it is.
22. Report the side you ACTUALLY SEE in each image. Do not assume the first image is the front and the second is the back — a citizen can easily photograph the same side twice, or photograph them in the wrong order, and saying so is the single most useful thing you can report when that happens. If both images show the same side, say so honestly in these two fields.
23. Judging the side is independent of readability: a blurred image whose layout is plainly the address side is still "back".

If neither image is a Pakistani CNIC at all, set readable to false and return null for every field.`;

const romanAddressSchema = {
  type: Type.OBJECT,
  nullable: true,
  properties: {
    raw: { type: Type.STRING, nullable: true },
    houseNumber: { type: Type.STRING, nullable: true },
    streetOrMohalla: { type: Type.STRING, nullable: true },
    sector: { type: Type.STRING, nullable: true },
    district: { type: Type.STRING, nullable: true },
    city: { type: Type.STRING, nullable: true },
  },
};

const addressPartsSchema = {
  type: Type.OBJECT,
  nullable: true,
  properties: {
    raw: { type: Type.STRING, nullable: true },
    houseNumber: { type: Type.STRING, nullable: true },
    streetOrMohalla: { type: Type.STRING, nullable: true },
    sector: { type: Type.STRING, nullable: true },
    district: { type: Type.STRING, nullable: true },
    city: { type: Type.STRING, nullable: true },
    roman: romanAddressSchema,
    confidence: { type: Type.NUMBER },
  },
};

const fieldConfidenceSchema = {
  type: Type.OBJECT,
  properties: {
    fullName: { type: Type.NUMBER },
    fatherName: { type: Type.NUMBER },
    cnicNumber: { type: Type.NUMBER },
    dateOfBirth: { type: Type.NUMBER },
    dateOfIssue: { type: Type.NUMBER },
    dateOfExpiry: { type: Type.NUMBER },
    gender: { type: Type.NUMBER },
    nationality: { type: Type.NUMBER },
  },
};

const extractionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    readable: { type: Type.BOOLEAN },
    frontReadable: { type: Type.BOOLEAN, nullable: true },
    backReadable: { type: Type.BOOLEAN, nullable: true },
    /* Which side each image ACTUALLY shows — see prompt rules 21-23. */
    frontImageSide: { type: Type.STRING, nullable: true },
    backImageSide: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER },
    fieldConfidence: fieldConfidenceSchema,
    fullName: { type: Type.STRING, nullable: true },
    fatherName: { type: Type.STRING, nullable: true },
    cnicNumber: { type: Type.STRING, nullable: true },
    dateOfBirth: { type: Type.STRING, nullable: true },
    dateOfIssue: { type: Type.STRING, nullable: true },
    dateOfExpiry: { type: Type.STRING, nullable: true },
    gender: { type: Type.STRING, nullable: true },
    nationality: { type: Type.STRING, nullable: true },
    presentAddress: addressPartsSchema,
    permanentAddress: addressPartsSchema,
  },
  required: ["readable", "confidence"],
};

/*
 * The model's output is untrusted input. Everything is re-validated here before
 * it is allowed any further into the system.
 */
const nullableText = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const nullableAddressLine = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const romanPartsPayloadSchema = z
  .object({
    raw: nullableAddressLine,
    houseNumber: nullableText,
    streetOrMohalla: nullableText,
    sector: nullableText,
    district: nullableText,
    city: nullableText,
  })
  .nullable()
  .optional();

const addressPartsPayloadSchema = z
  .object({
    raw: nullableAddressLine,
    houseNumber: nullableText,
    streetOrMohalla: nullableText,
    sector: nullableText,
    district: nullableText,
    city: nullableText,
    roman: romanPartsPayloadSchema,
    // A block that omits its own score is treated as unconfident, not as
    // certain — the gate downstream reads 0 as "do not show this".
    confidence: z.number().min(0).max(1).catch(0).optional(),
  })
  .nullable()
  .optional();

/** Same reasoning: an unscored field is an unconfident field. */
const confidenceScore = z.number().min(0).max(1).catch(0).optional();

const fieldConfidencePayloadSchema = z
  .object({
    fullName: confidenceScore,
    fatherName: confidenceScore,
    cnicNumber: confidenceScore,
    dateOfBirth: confidenceScore,
    dateOfIssue: confidenceScore,
    dateOfExpiry: confidenceScore,
    gender: confidenceScore,
    nationality: confidenceScore,
  })
  .nullable()
  .optional();

/**
 * The side an image was observed to show.
 *
 * Unknown or malformed values collapse to null, meaning "the model expressed
 * no usable opinion". That is deliberately different from "unknown", which is
 * the model positively saying it could not tell — only the latter is worth
 * reporting to the citizen.
 */
const observedSideSchema = z
  .enum(["front", "back", "unknown"])
  .nullable()
  .optional()
  .catch(null);

const geminiPayloadSchema = z.object({
  readable: z.boolean(),
  // Per-side, so a retake never has to guess or re-ask for a side that was
  // already clear. Absent/malformed is treated as "no signal" (null), never
  // as a false claim that a side failed.
  frontReadable: z.boolean().nullable().optional().catch(null),
  backReadable: z.boolean().nullable().optional().catch(null),
  /*
   * Which side each image actually shows. Anything the model returns that is
   * not one of the three known values becomes null ("no opinion") rather than
   * an error — an unrecognised string must never be able to accuse a citizen
   * of photographing the wrong side.
   */
  frontImageSide: observedSideSchema,
  backImageSide: observedSideSchema,
  confidence: z.number().min(0).max(1).catch(0),
  fieldConfidence: fieldConfidencePayloadSchema,
  fullName: nullableText,
  fatherName: nullableText,
  cnicNumber: nullableText,
  dateOfBirth: nullableText,
  dateOfIssue: nullableText,
  dateOfExpiry: nullableText,
  gender: nullableText,
  nationality: nullableText,
  presentAddress: addressPartsPayloadSchema,
  permanentAddress: addressPartsPayloadSchema,
});

/** The Roman-Urdu mirror of an address block — a phonetic rendering, never a translation. */
export interface CnicAddressRomanParts {
  raw: string | null;
  houseNumber: string | null;
  streetOrMohalla: string | null;
  sector: string | null;
  district: string | null;
  city: string | null;
}

export interface CnicAddressParts {
  /**
   * Exactly what was printed, in the script it was printed in — Urdu stays
   * Urdu. Kept even if the split below is imperfect, so nothing the card
   * actually says is lost to a bad segmentation.
   */
  raw: string | null;
  houseNumber: string | null;
  streetOrMohalla: string | null;
  /** Islamabad-style sector code (e.g. "G-11"). Null for cities that don't use sectors. */
  sector: string | null;
  district: string | null;
  city: string | null;
  /** The same fields transliterated into Roman Urdu, field for field. */
  roman: CnicAddressRomanParts | null;
  /** 0–1, the model's confidence in this block specifically. */
  confidence: number;
}

/*
 * A type alias rather than an interface, deliberately: the accuracy gate reads
 * scores by field name against a Record, and only an alias is assignable to an
 * index-signature type in TypeScript.
 */
export type CnicFieldConfidence = {
  fullName?: number;
  fatherName?: number;
  cnicNumber?: number;
  dateOfBirth?: number;
  dateOfIssue?: number;
  dateOfExpiry?: number;
  gender?: number;
  nationality?: number;
};

/** Which side of the card an image was observed to show. Null = no usable opinion. */
export type ObservedSide = "front" | "back" | "unknown" | null;

export interface CnicExtraction {
  readable: boolean;
  /** Null when that side was not submitted at all — never a false claim of failure. */
  frontReadable: boolean | null;
  backReadable: boolean | null;
  /**
   * Which side each submitted image ACTUALLY shows, as observed — not as
   * assumed from the slot it arrived in. This is what catches a citizen
   * photographing the front twice, which otherwise produces a perfectly
   * confident read that simply has no address in it and no explanation why.
   */
  frontImageSide: ObservedSide;
  backImageSide: ObservedSide;
  confidence: number;
  /** Per-field certainty, fed straight into the accuracy gate. */
  fieldConfidence: CnicFieldConfidence;
  fullName: string | null;
  fatherName: string | null;
  cnicNumber: string | null;
  dateOfBirth: string | null;
  dateOfIssue: string | null;
  dateOfExpiry: string | null;
  gender: string | null;
  nationality: string | null;
  presentAddress: CnicAddressParts | null;
  permanentAddress: CnicAddressParts | null;
}

export type ExtractionFailure =
  | "not_configured"
  | "unreadable"
  | "upstream_error"
  | "malformed_response";

export class CnicExtractionError extends Error {
  constructor(readonly reason: ExtractionFailure, message: string) {
    super(message);
    this.name = "CnicExtractionError";
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** "Male" / "Female" / null — anything else the model says is discarded. */
function normaliseGender(value: string | null): string | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("m")) return "Male";
  if (lower.startsWith("f")) return "Female";
  return null;
}

function normaliseRoman(
  value: z.infer<typeof romanPartsPayloadSchema>,
): CnicAddressRomanParts | null {
  if (!value) return null;

  const parts: CnicAddressRomanParts = {
    raw: value.raw ?? null,
    houseNumber: value.houseNumber ?? null,
    streetOrMohalla: value.streetOrMohalla ?? null,
    sector: value.sector ?? null,
    district: value.district ?? null,
    city: value.city ?? null,
  };

  return Object.values(parts).some((field) => field !== null) ? parts : null;
}

function normaliseAddress(
  value: z.infer<typeof addressPartsPayloadSchema>,
): CnicAddressParts | null {
  if (!value) return null;

  const printed = {
    raw: value.raw ?? null,
    houseNumber: value.houseNumber ?? null,
    streetOrMohalla: value.streetOrMohalla ?? null,
    sector: value.sector ?? null,
    district: value.district ?? null,
    city: value.city ?? null,
  };

  const roman = normaliseRoman(value.roman);

  // Nothing at all came back for this block — treat it as "not printed".
  const hasAnything =
    Object.values(printed).some((field) => field !== null) || roman !== null;
  if (!hasAnything) return null;

  return { ...printed, roman, confidence: value.confidence ?? 0 };
}

export interface CnicImage {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Sends one or two CNIC images (front, and optionally back) to Gemini and
 * returns validated, structured fields — identity from the front, address from
 * the back if a back image was supplied and the card actually carries one.
 *
 * Images are passed through in memory and never written to disk here.
 */
export async function extractCnicFromImages(
  front: CnicImage,
  back?: CnicImage,
): Promise<CnicExtraction> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new CnicExtractionError(
      "not_configured",
      "GEMINI_API_KEY is not configured.",
    );
  }

  const client = new GoogleGenAI({ apiKey });

  let rawText: string | undefined;

  try {
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: EXTRACTION_PROMPT },
      { text: "Image 1: front of the CNIC." },
      { inlineData: { mimeType: front.mimeType, data: front.bytes.toString("base64") } },
    ];

    if (back) {
      parts.push(
        { text: "Image 2: back of the CNIC." },
        { inlineData: { mimeType: back.mimeType, data: back.bytes.toString("base64") } },
      );
    }

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: extractionResponseSchema,
        // Near-deterministic: this is a reading task, not a creative one.
        temperature: 0,
      },
    });

    rawText = response.text;
  } catch (error) {
    // Log the shape of the failure, never the image or its contents.
    console.error(
      "[cnic-extract] upstream request failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    throw new CnicExtractionError(
      "upstream_error",
      "The extraction service could not be reached.",
    );
  }

  if (!rawText) {
    throw new CnicExtractionError(
      "malformed_response",
      "The extraction service returned an empty response.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new CnicExtractionError(
      "malformed_response",
      "The extraction service returned invalid JSON.",
    );
  }

  const result = geminiPayloadSchema.safeParse(parsed);

  if (!result.success) {
    throw new CnicExtractionError(
      "malformed_response",
      "The extraction service returned unexpected fields.",
    );
  }

  const data = result.data;

  return {
    readable: data.readable,
    frontReadable: data.frontReadable ?? null,
    backReadable: data.backReadable ?? null,
    frontImageSide: data.frontImageSide ?? null,
    // A side that was never submitted has no observed side at all — reporting
    // one would let a front-only scan be accused of a wrong-side mistake.
    backImageSide: back ? (data.backImageSide ?? null) : null,
    confidence: data.confidence,
    fieldConfidence: data.fieldConfidence ?? {},
    fullName: data.fullName ?? null,
    fatherName: data.fatherName ?? null,
    cnicNumber: data.cnicNumber ?? null,
    dateOfBirth: data.dateOfBirth ?? null,
    dateOfIssue: data.dateOfIssue ?? null,
    dateOfExpiry: data.dateOfExpiry ?? null,
    gender: normaliseGender(data.gender ?? null),
    nationality: data.nationality ?? null,
    presentAddress: normaliseAddress(data.presentAddress),
    permanentAddress: normaliseAddress(data.permanentAddress),
  };
}
