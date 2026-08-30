import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { civicIssue, issueReport } from "@/db/authority/schema";
import { canAccessIssue, getAuthorityViewer } from "@/lib/authority/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ decision: z.enum(["confirm", "reject"]) });

/*
 * POST /api/authority/links/[id]
 *
 * A member's verdict on an uncertain grouping. This is the other half of "do
 * not blindly merge": the agent flags what it is unsure about, and a person
 * decides.
 *
 * Rejecting UNLINKS the report rather than deleting it. The citizen's report
 * is never destroyed by an authority decision — it simply stops belonging to
 * this issue and is picked up again on the next intake pass, where it can
 * open an issue of its own.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getAuthorityViewer();
  if (!viewer) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }

  const { id } = await params;

  const [link] = await db
    .select({
      id: issueReport.id,
      issueId: issueReport.issueId,
      authorityId: civicIssue.authorityId,
      departmentId: civicIssue.departmentId,
    })
    .from(issueReport)
    .innerJoin(civicIssue, eq(issueReport.issueId, civicIssue.id))
    .where(eq(issueReport.id, id))
    .limit(1);

  if (!link || !canAccessIssue(viewer, link)) {
    return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
  }

  if (parsed.data.decision === "confirm") {
    await db
      .update(issueReport)
      .set({ matchStatus: "confirmed" })
      .where(eq(issueReport.id, id));

    return NextResponse.json({ success: true, data: { matchStatus: "confirmed" } });
  }

  await db.delete(issueReport).where(eq(issueReport.id, id));
  await db
    .update(civicIssue)
    .set({
      // Floored at zero so a double-submit can never drive the count negative.
      reportCount: sql`greatest(${civicIssue.reportCount} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(civicIssue.id, link.issueId));

  return NextResponse.json({ success: true, data: { matchStatus: "rejected" } });
}
