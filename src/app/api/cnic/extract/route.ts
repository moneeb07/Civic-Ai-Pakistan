import { NextResponse } from "next/server";

import {
  CnicExtractionError,
  extractCnicFromImages,
  isGeminiConfigured,
  type CnicAddressParts,
} from "@/services/gemini/cnic-extractor";
import { formatCnic, isValidCnicFormat, maskCnic } from "@/lib/cnic";
import {
  ADDRESS_CONFIDENCE_MIN,
  evaluateExtractionConfidence,
  type GateFailure,
} from "@/lib/cnic-confidence";
import { getOrCreateRegistrationSession } from "@/lib/registration/session";

/*
 * POST /api/cnic/extract
 *
 * multipart/form-data { front: File, back?: File } -> structured, validated
 * CNIC fields, including present/permanent address read off the back.
 *
 * Images are held in memory for the duration of the request and never written
 * to disk. Nothing extracted is persisted here — the citizen must review and
 * confirm it first (see /api/registration/identity).
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

// Gemini needs a real request; keep this off the static/edge path.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * An address block is only passed on when the back was actually photographed
 * AND the model was confident about what it read there. A block that fails
 * either test is dropped entirely rather than shown with a caveat — the
 * citizen types their address on the Address step instead, which is a correct
 * outcome, where a half-read Urdu line silently becomes a wrong one.
 */
function readableAddress(parts: CnicAddressParts | null, backScanned: boolean) {
  if (!parts || !backScanned) return null;
  if (parts.confidence < ADDRESS_CONFIDENCE_MIN) return null;

  return {
    raw: parts.raw,
    houseNumber: parts.houseNumber,
    streetOrMohalla: parts.streetOrMohalla,
    sector: parts.sector,
    district: parts.district,
    city: parts.city,
    roman: parts.roman,
    confidence: parts.confidence,
  };
}

/** Whether the model returned anything at all for an address block. */
function addressHasContent(parts: CnicAddressParts | null): boolean {
  if (!parts) return false;
  return [
    parts.raw,
    parts.houseNumber,
    parts.streetOrMohalla,
    parts.sector,
    parts.district,
    parts.city,
  ].some((field) => Boolean(field));
}

/*
 * One message per gate failure. Every one of them names something the citizen
 * can actually change — never "extraction failed", which tells them nothing
 * and leaves them retaking the same bad photo.
 */
const GATE_MESSAGES: Record<GateFailure, string> = {
  unreadable:
    "I can't read the CNIC clearly. Please adjust the lighting, distance, or position and try again.",
  low_confidence:
    "Some CNIC information is unclear. Please retake the image with better lighting and focus.",
  critical_field_unclear:
    "I couldn't clearly read your name and CNIC number. Please retake the image with better lighting and focus.",
  address_unclear:
    "I couldn't clearly read the address on the back of your CNIC. Please retake the image with better lighting and focus.",
};

export async function POST(request: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      {
        success: false,
        reason: "not_configured",
        message:
          "CNIC scanning is not available right now. You can enter your CNIC details manually instead.",
      },
      { status: 503 },
    );
  }

  // An onboarding session must exist before a CNIC image is accepted, so this
  // endpoint cannot be used as an anonymous image-analysis service.
  await getOrCreateRegistrationSession();

  let frontFile: File | null = null;
  let backFile: File | null = null;

  try {
    const form = await request.formData();
    const frontValue = form.get("front");
    const backValue = form.get("back");
    if (frontValue instanceof File) frontFile = frontValue;
    if (backValue instanceof File) backFile = backValue;
  } catch {
    return NextResponse.json(
      { success: false, reason: "invalid_request", message: "We couldn't read that upload." },
      { status: 400 },
    );
  }

  if (!frontFile) {
    return NextResponse.json(
      { success: false, reason: "invalid_request", message: "Please provide the front of your CNIC." },
      { status: 400 },
    );
  }

  for (const file of [frontFile, backFile].filter(Boolean) as File[]) {
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          reason: "unsupported_type",
          message: "Please upload a JPEG, PNG or WebP image.",
        },
        { status: 415 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          success: false,
          reason: "too_large",
          message: "That image is too large. Please retake the photo.",
        },
        { status: 413 },
      );
    }
  }

  try {
    const frontBytes = Buffer.from(await frontFile.arrayBuffer());
    const backBytes = backFile ? Buffer.from(await backFile.arrayBuffer()) : undefined;

    const extraction = await extractCnicFromImages(
      { bytes: frontBytes, mimeType: frontFile.type },
      backBytes && backFile ? { bytes: backBytes, mimeType: backFile.type } : undefined,
    );

    /*
     * Gemini's output is untrusted. A number that is not CNIC-shaped is dropped
     * rather than shown to the citizen as if it had been read successfully.
     */
    const rawCnic = extraction.cnicNumber;
    const cnicIsValid = rawCnic ? isValidCnicFormat(rawCnic) : false;
    const cnicNumber = cnicIsValid ? formatCnic(rawCnic!) : null;

    const backScanned = Boolean(backFile);

    const values = {
      fullName: extraction.fullName,
      fatherName: extraction.fatherName,
      cnicNumber,
      dateOfBirth: extraction.dateOfBirth,
      dateOfIssue: extraction.dateOfIssue,
      dateOfExpiry: extraction.dateOfExpiry,
      gender: extraction.gender,
      nationality: extraction.nationality,
    };

    /*
     * The accuracy gate. Nothing below this point is allowed to show the
     * citizen a value the model was not sure of — a failure here sends them
     * back to the camera with a specific reason instead.
     */
    const gate = evaluateExtractionConfidence({
      readable: extraction.readable,
      confidence: extraction.confidence,
      fieldConfidence: extraction.fieldConfidence,
      values,
      backScanned,
      addressBlocks: [extraction.presentAddress, extraction.permanentAddress].map(
        (block) => ({
          hasContent: addressHasContent(block),
          confidence: block?.confidence ?? 0,
        }),
      ),
    });

    if (!gate.pass) {
      const failure = gate.failure ?? "low_confidence";
      return NextResponse.json(
        {
          success: false,
          reason: "low_confidence",
          gateFailure: failure,
          message: GATE_MESSAGES[failure],
        },
        { status: 422 },
      );
    }

    /*
     * Only fields that cleared the per-field bar survive. A field the model
     * returned but was unsure about is blanked here — the citizen sees an
     * empty box to fill in, never a plausible-looking wrong value.
     */
    const accepted = new Set(gate.acceptedFields);
    const keep = <T,>(field: string, value: T): T | null =>
      accepted.has(field) ? value : null;

    const safeCnic = keep("cnicNumber", cnicNumber);

    /*
     * The response carries the full CNIC exactly once, because the citizen has
     * to see it to check it. It is masked for display everywhere afterwards and
     * encrypted the moment they confirm. It is never logged. Addresses are not
     * masked — they are not the same sensitivity class as a national ID number.
     */
    return NextResponse.json({
      success: true,
      data: {
        fullName: keep("fullName", extraction.fullName),
        fatherName: keep("fatherName", extraction.fatherName),
        cnicNumber: safeCnic,
        cnicMasked: safeCnic ? maskCnic(safeCnic) : null,
        dateOfBirth: keep("dateOfBirth", extraction.dateOfBirth),
        dateOfIssue: keep("dateOfIssue", extraction.dateOfIssue),
        dateOfExpiry: keep("dateOfExpiry", extraction.dateOfExpiry),
        gender: keep("gender", extraction.gender),
        nationality: keep("nationality", extraction.nationality),
        confidence: extraction.confidence,
        // Which fields actually came off the card AND cleared the bar —
        // drives the "From CNIC" badges.
        extractedFields: gate.acceptedFields,
        /** Fields read but withheld for low confidence, so the UI can say so. */
        withheldFields: gate.droppedFields,
        // True only when the number is CNIC-shaped. NOT a claim of authenticity.
        cnicFormatChecked: cnicIsValid,
        presentAddress: readableAddress(extraction.presentAddress, backScanned),
        permanentAddress: readableAddress(extraction.permanentAddress, backScanned),
        backScanned,
      },
    });
  } catch (error) {
    if (error instanceof CnicExtractionError) {
      const status = error.reason === "not_configured" ? 503 : 502;
      return NextResponse.json(
        {
          success: false,
          reason: error.reason,
          message:
            "We couldn't process your CNIC right now. Please try again, or enter your details manually.",
        },
        { status },
      );
    }

    console.error("[cnic-extract] unexpected failure");
    return NextResponse.json(
      {
        success: false,
        reason: "unexpected",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 },
    );
  }
}
