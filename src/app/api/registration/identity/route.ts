import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { decryptSensitive, encryptSensitive, hashSensitive } from "@/lib/crypto";
import { formatCnic, maskCnic } from "@/lib/cnic";
import { carryOverAddresses } from "@/lib/registration/address-carryover";
import { identitySchema, type CnicAddressData } from "@/lib/registration/schema";
import {
  getOrCreateRegistrationSession,
  updateRegistrationSession,
} from "@/lib/registration/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nullableShortText = z.string().trim().max(120).nullable().optional();

/*
 * What the client sends back is exactly what /api/cnic/extract returned to it
 * — untrusted output from the model, passed through the browser. It gets the
 * same treatment as any other client input: validated shape, capped length,
 * nothing executed or trusted just because it "looks like" it came from Gemini.
 */
const addressPartsShape = {
  raw: z.string().trim().max(300).nullable().optional(),
  houseNumber: nullableShortText,
  streetOrMohalla: nullableShortText,
  sector: nullableShortText,
  district: nullableShortText,
  city: nullableShortText,
};

const cnicAddressPayloadSchema = z
  .object({
    ...addressPartsShape,
    // The Roman-Urdu mirror, held to the same shape and the same length caps.
    roman: z.object(addressPartsShape).nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .nullable()
  .optional();

function normaliseAddressPayload(
  value: z.infer<typeof cnicAddressPayloadSchema>,
): CnicAddressData | null {
  if (!value) return null;
  return {
    raw: value.raw ?? null,
    houseNumber: value.houseNumber ?? null,
    streetOrMohalla: value.streetOrMohalla ?? null,
    sector: value.sector ?? null,
    district: value.district ?? null,
    city: value.city ?? null,
    roman: value.roman
      ? {
          raw: value.roman.raw ?? null,
          houseNumber: value.roman.houseNumber ?? null,
          streetOrMohalla: value.roman.streetOrMohalla ?? null,
          sector: value.roman.sector ?? null,
          district: value.roman.district ?? null,
          city: value.roman.city ?? null,
        }
      : null,
    confidence: value.confidence,
  };
}

/*
 * POST /api/registration/identity
 *
 * Saves the identity the citizen CONFIRMED — whether it came from a CNIC scan
 * they accepted or was typed in by hand. Extraction output never reaches this
 * endpoint directly; confirmation always happens first.
 */
export async function POST(request: Request) {
  const session = await getOrCreateRegistrationSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "We couldn't read that request." },
      { status: 400 },
    );
  }

  const parsed = identitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please check the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const values = parsed.data;
  const canonicalCnic = formatCnic(values.cnicNumber);
  const cnicHash = hashSensitive(canonicalCnic);

  /*
   * Duplicate check. The message deliberately does not confirm that an account
   * exists — that would let anyone test whether a given CNIC is registered.
   */
  const [existing] = await db
    .select({ id: schema.userProfile.id })
    .from(schema.userProfile)
    .where(eq(schema.userProfile.cnicHash, cnicHash))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        success: false,
        reason: "duplicate",
        message:
          "An account may already exist with this identity information. Please try signing in.",
      },
      { status: 409 },
    );
  }

  const source = (body as { identitySource?: string } | null)?.identitySource;

  const presentAddressResult = cnicAddressPayloadSchema.safeParse(
    (body as { presentAddress?: unknown } | null)?.presentAddress,
  );
  const permanentAddressResult = cnicAddressPayloadSchema.safeParse(
    (body as { permanentAddress?: unknown } | null)?.permanentAddress,
  );

  const incomingPresent = normaliseAddressPayload(
    presentAddressResult.success ? presentAddressResult.data : null,
  );
  const incomingPermanent = normaliseAddressPayload(
    permanentAddressResult.success ? permanentAddressResult.data : null,
  );

  /*
   * Is this the same card we already read, or a different one?
   *
   * The session is merged, not replaced, so writing the address fields
   * unconditionally means ANY later pass through this step — entering details
   * manually, or a rescan that only captured the front — silently destroys an
   * address that was read correctly the first time. That is the "it worked
   * once and then stopped" bug: the address was extracted every time, and
   * then overwritten with null on the way in.
   *
   * Keeping the stored address is only safe while it belongs to the same
   * person's card. If the CNIC number has changed, this is a different
   * document and anything held from the previous one must go, or one card's
   * address would be attached to another card's identity.
   */
  const previous = session.data;
  const sameCard =
    Boolean(previous.cnicEncrypted) &&
    (() => {
      try {
        return decryptSensitive(previous.cnicEncrypted!) === canonicalCnic;
      } catch {
        // An undecryptable value cannot be shown to match anything.
        return false;
      }
    })();

  /*
   * A freshly-read address always wins; otherwise the stored one survives for
   * the same card — spec §25/§26: never discard information that was read
   * successfully just because a later step had nothing to say about it.
   */
  const addresses = carryOverAddresses(
    { present: incomingPresent, permanent: incomingPermanent },
    { present: previous.cnicPresentAddress, permanent: previous.cnicPermanentAddress },
    sameCard,
  );

  await updateRegistrationSession(
    session.id,
    {
      fullName: values.fullName,
      fatherName: values.fatherName || null,
      // The raw number leaves memory here; only these three forms are stored.
      cnicEncrypted: encryptSensitive(canonicalCnic),
      cnicMasked: maskCnic(canonicalCnic),
      dateOfBirth: values.dateOfBirth || null,
      dateOfIssue: values.dateOfIssue || null,
      dateOfExpiry: values.dateOfExpiry || null,
      gender: values.gender ?? null,
      nationality: values.nationality || null,
      identitySource: source === "cnic_scan" ? "cnic_scan" : "manual",
      extractedFields: Array.isArray(
        (body as { extractedFields?: unknown })?.extractedFields,
      )
        ? ((body as { extractedFields: string[] }).extractedFields)
        : [],
      cnicPresentAddress: addresses.present,
      cnicPermanentAddress: addresses.permanent,
    },
    "contact",
  );

  return NextResponse.json({
    success: true,
    next: "contact",
    cnicMasked: maskCnic(canonicalCnic),
  });
}
