import { notFound } from "next/navigation";

import { CameraFlow } from "@/components/report/camera-flow";
import { ReportShell } from "@/components/report/report-shell";
import { requireSession } from "@/lib/session";
import { getOwnedReport } from "@/lib/report/store";

export const dynamic = "force-dynamic";

export default async function ReportCameraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  // A missing report and someone else's report look identical from here —
  // both simply don't exist for this citizen.
  const report = await getOwnedReport(id, session.user.id);
  if (!report) notFound();

  return (
    <ReportShell step="camera" backHref="/dashboard">
      <CameraFlow reportId={id} />
    </ReportShell>
  );
}
