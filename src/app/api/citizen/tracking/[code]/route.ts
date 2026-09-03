import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getCitizenIssue } from "@/lib/civic/tracking";
import { normaliseIssueCode } from "@/lib/gov/issue-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/citizen/tracking/[code] — one tracked issue, with its stage timeline.
 *
 * Ownership is resolved inside the service, which returns null for a code this
 * citizen has no report in. Issue codes are sequential, so an endpoint that
 * distinguished "not yours" from "does not exist" would let anyone walk the
 * range and enumerate every civic issue in the country.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Please sign in.", reason: "unauthenticated" },
      { status: 401 },
    );
  }

  const { code } = await params;
  const issue = await getCitizenIssue(
    normaliseIssueCode(decodeURIComponent(code)),
    session.user.id,
  );

  if (!issue) {
    return NextResponse.json(
      { success: false, message: "Report not found.", reason: "not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: issue });
}
