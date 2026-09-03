import { ok, unauthorized } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import { listIssuesForOfficer } from "@/lib/gov/collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the issues in this officer's scope. The mobile officer list reads this. */
export async function GET(request: Request) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const issues = await listIssuesForOfficer(context.officer, {
    // Coerced rather than trusted: a non-numeric query string must fall back to
    // the default page rather than reaching the query as NaN.
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  });

  return ok(issues);
}
