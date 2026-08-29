import { notFound, redirect } from "next/navigation";

import { DescribeFlow } from "@/components/report/describe-flow";
import { ReportShell } from "@/components/report/report-shell";
import { requireSession } from "@/lib/session";
import { getOwnedReport } from "@/lib/report/store";

export const dynamic = "force-dynamic";

export default async function ReportDescribePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const report = await getOwnedReport(id, session.user.id);
  if (!report) notFound();
  if (!report.category) redirect(`/report/${id}/camera`);

  return (
    <ReportShell step="describe" backHref={`/report/${id}/camera`}>
      <DescribeFlow reportId={id} />
    </ReportShell>
  );
}
