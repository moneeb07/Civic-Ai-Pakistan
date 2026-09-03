import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GovPageHeading, GovShell } from "@/components/gov/gov-shell";
import { ToastProvider } from "@/components/gov/toast";
import { WorkflowBuilder } from "@/components/gov/workflow-builder";
import { ROLE_HOME } from "@/lib/gov/schema";
import { requireOfficer } from "@/lib/gov/session";
import { getWorkflow } from "@/lib/gov/workflow";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "Resolution workflow" };
export const dynamic = "force-dynamic";

/*
 * The workflow builder.
 *
 * Only a department head reaches this: the workflow decides how every
 * complaint in their department is handled, so it is theirs to define. A
 * member redirected here would be editing their own job description.
 *
 * getWorkflow() returns the seeded default flagged isTemplate when nothing has
 * been saved, so a new department lands on something reviewable rather than
 * an empty page.
 */
export default async function GovWorkflowPage() {
  const { officer } = await requireOfficer();

  if (officer.role !== "dept_head") redirect(ROLE_HOME[officer.role]);
  if (!officer.deptId) redirect("/gov/login?reason=no_access");

  const workflow = await getWorkflow(officer.deptId);

  return (
    <ToastProvider>
      <GovShell officer={officer} backHref="/gov/dept">
        <GovPageHeading title={t.gov.workflow.title} subtitle={t.gov.workflow.subtitle} />
        <WorkflowBuilder deptId={officer.deptId} initial={workflow} />
      </GovShell>
    </ToastProvider>
  );
}
