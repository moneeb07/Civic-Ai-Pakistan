import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  addressSchema,
  contactSchema,
  preferencesSchema,
  profilePhotoSchema,
  type RegistrationData,
} from "@/lib/registration/schema";
import {
  getRegistrationSession,
  getOrCreateRegistrationSession,
  updateRegistrationSession,
} from "@/lib/registration/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/registration/step  { step: "contact" | "address" | "photo" | "preferences", values }
 *
 * One endpoint for the steps that only collect data. Identity has its own route
 * because it also does encryption and duplicate detection, and the password is
 * never sent here at all.
 */
export async function POST(request: Request) {
  const session = await getOrCreateRegistrationSession();

  let body: { step?: string; values?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "We couldn't read that request." },
      { status: 400 },
    );
  }

  switch (body.step) {
    case "contact": {
      const parsed = contactSchema.safeParse(body.values);
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

      // Surface an existing email now rather than at the very last step.
      const [taken] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, parsed.data.email))
        .limit(1);

      if (taken) {
        return NextResponse.json(
          {
            success: false,
            reason: "email_taken",
            fieldErrors: {
              email: [
                "An account already exists with this email address. Please sign in instead.",
              ],
            },
          },
          { status: 409 },
        );
      }

      await updateRegistrationSession(
        session.id,
        { phone: parsed.data.phone, email: parsed.data.email },
        "security",
      );
      return NextResponse.json({ success: true, next: "security" });
    }

    case "address": {
      const parsed = addressSchema.safeParse(body.values);
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

      await updateRegistrationSession(
        session.id,
        {
          houseNumber: parsed.data.houseNumber || null,
          city: parsed.data.city,
          district: parsed.data.district || null,
          sector: parsed.data.sector || null,
          street: parsed.data.street || null,
          road: parsed.data.road || null,
          residentialAddress: parsed.data.residentialAddress,
          // Kept as its own column all the way through — never folded into
          // the current address (spec §12).
          permanentAddress: parsed.data.permanentAddress || null,
        },
        "photo",
      );
      return NextResponse.json({ success: true, next: "photo" });
    }

    case "photo": {
      // A profile photo is optional: skipping sends no values.
      if (!body.values) {
        await updateRegistrationSession(session.id, { profileImage: undefined }, "confirm");
        return NextResponse.json({ success: true, next: "confirm" });
      }

      const parsed = profilePhotoSchema.safeParse(body.values);
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            message:
              parsed.error.flatten().fieldErrors.image?.[0] ??
              "That image could not be used.",
          },
          { status: 400 },
        );
      }

      await updateRegistrationSession(
        session.id,
        { profileImage: parsed.data.image },
        "confirm",
      );
      return NextResponse.json({ success: true, next: "confirm" });
    }

    case "preferences": {
      const parsed = preferencesSchema.safeParse(body.values);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: "We couldn't save that preference." },
          { status: 400 },
        );
      }

      const patch: Partial<RegistrationData> = {};
      if (parsed.data.preferredLanguage) {
        patch.preferredLanguage = parsed.data.preferredLanguage;
      }
      if (typeof parsed.data.assistedMode === "boolean") {
        patch.assistedMode = parsed.data.assistedMode;
      }

      await updateRegistrationSession(session.id, patch);
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json(
        { success: false, message: "Unknown registration step." },
        { status: 400 },
      );
  }
}

/** GET /api/registration/step — the current session, with nothing sensitive in it. */
export async function GET() {
  const session = await getRegistrationSession();

  if (!session) {
    return NextResponse.json({ success: true, data: null });
  }

  const { cnicEncrypted, profileImage, ...safe } = session.data;

  return NextResponse.json({
    success: true,
    data: {
      ...safe,
      // Never echo the encrypted CNIC or the raw image back to the browser.
      hasCnic: Boolean(cnicEncrypted),
      hasProfileImage: Boolean(profileImage),
      step: session.step,
    },
  });
}
