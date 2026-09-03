import { badRequest, notFound, ok, readJson, unprocessable, fail } from "@/lib/gov/api";
import { rateComplaint } from "@/lib/gov/complaints";
import { rateComplaintSchema } from "@/lib/gov/schema";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/gov/reports/[reportId]/rate
 *
 * Called by the CITIZEN app, not by an officer — see src/lib/gov/README.md.
 * It lives under /api/gov because the gov side owns complaint_rating and the
 * ownership rule keeps this agent out of /api/citizen; the citizen-side agent
 * is free to proxy it behind their own path later.
 *
 * Authenticated as a citizen (getSession, not getOfficer) and the report's
 * ownership is checked inside the store query itself, so a citizen can only
 * rate their own complaint and rating someone else's is indistinguishable
 * from rating one that does not exist.
 *
 * Rating is optional and one-per-report. Nothing here can change how the
 * complaint was handled — it is feedback, recorded as feedback.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const session = await getSession();
  if (!session) return fail("Please sign in.", 401, "unauthenticated");

  const { reportId } = await params;
  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = rateComplaintSchema.safeParse(body);
  if (!parsed.success) return unprocessable("A rating must be between 1 and 5 stars.");

  const result = await rateComplaint({
    reportId,
    citizenUserId: session.user.id,
    stars: parsed.data.stars,
    comment: parsed.data.comment ?? null,
  });

  if ("error" in result) {
    if (result.error === "not_found") return notFound();
    return badRequest(
      result.error === "already_rated"
        ? "You've already rated this complaint."
        : "This complaint hasn't been resolved yet.",
      result.error,
    );
  }

  return ok({ rated: true });
}
