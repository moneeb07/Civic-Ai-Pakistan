import { getOfficer } from "@/lib/gov/session";
import { notFound, ok, unauthorized } from "@/lib/gov/api";
import { revokeInvite } from "@/lib/gov/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * DELETE /api/gov/invites/[id] — revoke an unused invitation.
 *
 * Not wrapped in withOfficer() because that helper's handler signature takes
 * only (context, request); this route also needs the dynamic segment.
 *
 * The creator scope lives in the DELETE's own WHERE clause, so revoking
 * someone else's invite matches zero rows and answers 404 — identical to an
 * id that never existed.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { id } = await params;
  const revoked = await revokeInvite(id, context.officer.id, context.officer.role === "platform_admin");

  if (!revoked) return notFound("That invitation no longer exists.");
  return ok({ revoked: true });
}
