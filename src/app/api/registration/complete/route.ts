import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { decryptSensitive, hashSensitive } from "@/lib/crypto";
import { storeProfileImage } from "@/lib/profile-image";
import { completeRegistrationSchema } from "@/lib/registration/schema";
import {
  deleteRegistrationSession,
  getRegistrationSession,
} from "@/lib/registration/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/registration/complete  { password }
 *
 * The only place an account is created. Order matters:
 *
 *   validate session -> re-check duplicates -> create auth user
 *   -> create profile -> store photo -> drop registration session
 *
 * The password arrives here for the first and only time and is handed straight
 * to Better Auth. It is never written to the registration session, never logged.
 */
export async function POST(request: Request) {
  const session = await getRegistrationSession();

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        reason: "expired",
        message: "Your registration session has expired. Please start again.",
      },
      { status: 440 },
    );
  }

  const data = session.data;

  // Server-side completeness check — the client's wizard is not trusted.
  const missing: string[] = [];
  if (!data.fullName || !data.cnicEncrypted || !data.cnicMasked) missing.push("identity");
  if (!data.phone || !data.email) missing.push("contact");
  if (!data.city || !data.residentialAddress) missing.push("address");

  if (missing.length > 0) {
    return NextResponse.json(
      {
        success: false,
        reason: "incomplete",
        missing,
        message: "Some information is still missing. Please complete every step.",
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "We couldn't read that request." },
      { status: 400 },
    );
  }

  const parsed = completeRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Your password does not meet the required security level.",
      },
      { status: 400 },
    );
  }

  // Re-check the CNIC at the last moment: another citizen may have registered
  // the same identity while this one was filling in the form.
  const cnicHash = hashSensitive(decryptSensitive(data.cnicEncrypted!));

  const [duplicate] = await db
    .select({ id: schema.userProfile.id })
    .from(schema.userProfile)
    .where(eq(schema.userProfile.cnicHash, cnicHash))
    .limit(1);

  if (duplicate) {
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

  // 1. Create the authentication user. Better Auth owns hashing and the session.
  let authResult: Awaited<ReturnType<typeof auth.api.signUpEmail>>;
  let setCookieHeaders: string[] = [];

  try {
    const { headers, response } = await auth.api.signUpEmail({
      body: {
        name: data.fullName!,
        email: data.email!,
        password: parsed.data.password,
      },
      returnHeaders: true,
    });

    authResult = response;
    setCookieHeaders = headers.getSetCookie();
  } catch (error) {
    const message =
      error instanceof Error && /exist/i.test(error.message)
        ? "An account already exists with this email address. Please sign in instead."
        : "We couldn't create your account right now. Please try again.";

    // Never log the password or the email/CNIC alongside the failure.
    console.error("[registration] account creation failed");

    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  const userId = authResult?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { success: false, message: "We couldn't create your account right now." },
      { status: 500 },
    );
  }

  // 2. Store the profile photo, if the citizen added one.
  let profileImagePath: string | null = null;
  if (data.profileImage) {
    const stored = await storeProfileImage(userId, data.profileImage);
    profileImagePath = stored?.relativePath ?? null;
  }

  // 3. Create the citizen profile.
  try {
    await db.insert(schema.userProfile).values({
      id: randomBytes(16).toString("base64url"),
      userId,
      fullName: data.fullName!,
      fatherName: data.fatherName ?? null,
      cnicHash,
      cnicMasked: data.cnicMasked!,
      cnicEncrypted: data.cnicEncrypted!,
      dateOfBirth: data.dateOfBirth ?? null,
      gender: data.gender ?? null,
      identitySource: data.identitySource === "cnic_scan" ? "cnic_scan" : "manual",
      phone: data.phone!,
      houseNumber: data.houseNumber ?? null,
      city: data.city ?? null,
      district: data.district ?? null,
      sector: data.sector ?? null,
      street: data.street ?? null,
      road: data.road ?? null,
      residentialAddress: data.residentialAddress ?? null,
      // The permanent address is a record of what the CNIC prints, not
      // something the citizen filled in — kept as-is, never edited here.
      permanentAddress: data.cnicPermanentAddress?.raw ?? null,
      profileImagePath,
      preferredLanguage: data.preferredLanguage ?? "en",
      assistedMode: data.assistedMode ?? false,
    });
  } catch {
    /*
     * The auth user exists but the profile failed. Roll it back rather than
     * stranding a citizen with credentials but no profile — the cascade on
     * user_profile.user_id means this cleans up fully.
     */
    console.error("[registration] profile creation failed; rolling back auth user");
    await db.delete(schema.user).where(eq(schema.user.id, userId));

    return NextResponse.json(
      { success: false, message: "We couldn't finish setting up your account. Please try again." },
      { status: 500 },
    );
  }

  // 4. The onboarding scratch data has served its purpose — remove it.
  await deleteRegistrationSession();

  // 5. Forward Better Auth's session cookies so the citizen lands signed in.
  const json = NextResponse.json({ success: true, redirectTo: "/dashboard" });
  for (const cookie of setCookieHeaders) {
    json.headers.append("set-cookie", cookie);
  }

  return json;
}
