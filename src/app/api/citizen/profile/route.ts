import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getCitizenProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/citizen/profile — the signed-in citizen's own profile.
 *
 * Exists for the mobile app. The web's profile page reads getCitizenProfile()
 * directly in a server component, which a native client cannot do, so this is
 * the same call behind an authenticated route — deliberately reusing that one
 * function rather than re-querying, so both clients are bound to the same
 * projection.
 *
 * That projection is already the safe one: it selects `cnicMasked` and never
 * `cnicEncrypted`/`cnicHash`, and reduces the stored image path to a boolean.
 * Nothing here widens it. Scoped to the session's own user id, so this route
 * cannot be used to read anybody else's profile.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Please sign in.", reason: "unauthenticated" },
      { status: 401 },
    );
  }

  const profile = await getCitizenProfile(session.user.id);

  if (!profile) {
    return NextResponse.json(
      { success: false, message: "No profile yet.", reason: "not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { ...profile, email: session.user.email },
  });
}
