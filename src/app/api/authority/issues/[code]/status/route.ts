import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { civicIssue, issueStatusEvent } from "@/db/authority/schema";
import {
  actingMembership,
  canAccessIssue,
  getAuthorityViewer,
} from "@/lib/authority/access";
import { getIssueByCode } from "@/lib/authority/queries";
import { updateStatusSchema } from "@/lib/authority/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/authority/issues/[code]/status
 *
 * Moves an issue between REPORTED, IN_PROCESS and RESOLVED and appends to its
 * history. The history is append-only: a status is never rewritten, so who
 * changed what and when survives.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const viewer = await getAuthorityViewer();
  if (!viewer) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const { code } = await params;
  const issue = await getIssueByCode(code);

  /*
   * A 404 for an issue that exists but is out of scope, deliberately: a 403
   * would confirm the issue is real to someone who should not know that.
   */
  if (!issue || !canAccessIssue(viewer, issue)) {
    return NextResponse.json({ success: false, message: "Issue not found." }, { status: 404 });
  }

  const parsed = updateStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Please choose a valid status." },
      { status: 400 },
    );
  }

  if (parsed.data.status === issue.status) {
    return NextResponse.json({ success: true, data: { status: issue.status } });
  }

  const acting = actingMembership(viewer, issue);

  await db.insert(issueStatusEvent).values({
    id: randomBytes(16).toString("base64url"),
    issueId: issue.id,
    fromStatus: issue.status,
    toStatus: parsed.data.status,
    note: parsed.data.note || null,
    memberId: acting?.memberId ?? null,
  });

  await db
    .update(civicIssue)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(civicIssue.id, issue.id));

  return NextResponse.json({ success: true, data: { status: parsed.data.status } });
}
