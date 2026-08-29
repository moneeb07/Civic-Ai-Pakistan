import { notFound, redirect } from "next/navigation";

import { ReportShell } from "@/components/report/report-shell";
import { ReviewFlow } from "@/components/report/review-flow";
import { requireSession } from "@/lib/session";
import { getOwnedReport } from "@/lib/report/store";

export const dynamic = "force-dynamic";

export default async function ReportReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const report = await getOwnedReport(id, session.user.id);
  if (!report) notFound();
  if (!report.locationLabel && report.latitude === null) redirect(`/report/${id}/location`);

  return (
    <ReportShell step="review" backHref={`/report/${id}/location`}>
      <ReviewFlow initialReport={report} />
    </ReportShell>
  );
}
