import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getProfileImagePath } from "@/lib/profile";
import { mimeTypeForPath, readProfileImage } from "@/lib/profile-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/profile/image — streams the signed-in citizen's own photo.
 *
 * Photos live outside /public and are only ever served to their owner, so one
 * citizen's photo is not reachable by guessing a URL.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });

  const relativePath = await getProfileImagePath(session.user.id);
  if (!relativePath) return new NextResponse(null, { status: 404 });

  const bytes = await readProfileImage(relativePath);
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": mimeTypeForPath(relativePath),
      // Private: proxies and shared caches must not retain a citizen's photo.
      "cache-control": "private, max-age=300",
    },
  });
}
