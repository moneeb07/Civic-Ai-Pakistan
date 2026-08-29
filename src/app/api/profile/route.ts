import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getCitizenProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/profile — the signed-in citizen's own profile. CNIC is masked. */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Please sign in." },
      { status: 401 },
    );
  }

  const profile = await getCitizenProfile(session.user.id);

  if (!profile) {
    return NextResponse.json(
      { success: false, message: "Profile not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { ...profile, email: session.user.email },
  });
}
