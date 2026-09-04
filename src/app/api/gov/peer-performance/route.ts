import { getOfficer } from "@/lib/gov/session";
import { ok, unauthorized } from "@/lib/gov/api";
import { getPeerPerformance } from "@/lib/gov/peer-performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/gov/peer-performance — how everyone one level below me is doing.
 *
 * The level is decided by the SERVER from the officer's own role, never by a
 * query parameter: a department head asking for the organisation table would
 * otherwise be a URL edit away from data outside their scope. What comes back
 * for a member is an empty table, because a member manages nobody.
 */
export async function GET() {
  const context = await getOfficer();
  if (!context) return unauthorized();

  return ok(await getPeerPerformance(context.officer));
}
