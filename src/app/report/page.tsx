import { redirect } from "next/navigation";

import { requireSession } from "@/lib/session";
import { createReportDraft } from "@/lib/report/store";

export const dynamic = "force-dynamic";

/** Entry point: starts a fresh complaint draft and heads straight to the camera. */
export default async function ReportEntryPage() {
  const session = await requireSession();
  const report = await createReportDraft(session.user.id);
  redirect(`/report/${report.id}/camera`);
}
