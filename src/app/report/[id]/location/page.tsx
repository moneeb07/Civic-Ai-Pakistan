import { notFound, redirect } from "next/navigation";

import { LocationFlow } from "@/components/report/location-flow";
import { ReportShell } from "@/components/report/report-shell";
import { requireSession } from "@/lib/session";
import { getOwnedReport } from "@/lib/report/store";

export const dynamic = "force-dynamic";

export default async function ReportLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const report = await getOwnedReport(id, session.user.id);
  if (!report) notFound();
  if (!report.transcript) redirect(`/report/${id}/describe`);

  return (
    <ReportShell step="location" backHref={`/report/${id}/describe`}>
      <LocationFlow reportId={id} />
    </ReportShell>
  );
}
