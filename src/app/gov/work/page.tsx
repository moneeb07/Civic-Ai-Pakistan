import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { ComplaintCard } from "@/components/gov/complaint-card";
import { GovPageHeading, GovShell } from "@/components/gov/gov-shell";
import { EmptyState } from "@/components/gov/states";
import { listMemberComplaints } from "@/lib/gov/complaints";
import { ROLE_HOME } from "@/lib/gov/schema";
import { requireOfficer } from "@/lib/gov/session";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "My work" };
export const dynamic = "force-dynamic";

/*
 * A field member's own caseload.
 *
 * Only what is assigned to them — being in a department is not a reason to
 * read a colleague's complaints, which carry a citizen's photo and location.
 * The scoping is in listMemberComplaints()' WHERE clause, not here.
 */
export default async function GovWorkPage() {
  const { officer } = await requireOfficer();

  if (officer.role !== "member") redirect(ROLE_HOME[officer.role]);
  if (!officer.deptId) redirect("/gov/login?reason=no_access");

  const complaints = await listMemberComplaints(officer.deptId, officer.id);

  return (
    <GovShell officer={officer}>
      <GovPageHeading title={t.gov.dept.queueEyebrow} subtitle={t.gov.dept.subtitle} />

      {complaints.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t.gov.dept.noQueueTitle}
          body={t.gov.dept.noQueueBody}
        />
      ) : (
        <ul className="space-y-2">
          {complaints.map((complaint) => (
            <li key={complaint.reportId}>
              <ComplaintCard
                complaint={complaint}
                href={`/gov/complaints/${complaint.reportId}`}
              />
            </li>
          ))}
        </ul>
      )}
    </GovShell>
  );
}
