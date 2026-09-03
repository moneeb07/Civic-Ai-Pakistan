import { ok, unauthorized } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import { markNotificationRead } from "@/lib/gov/collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — marks one notification read. The update is scoped to the caller. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { id } = await params;
  await markNotificationRead(id, context.officer.id);
  return ok({ read: true });
}
