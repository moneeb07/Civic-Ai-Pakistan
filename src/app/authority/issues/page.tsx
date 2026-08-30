import { IssueList } from "@/components/authority/issue-list";
import { IssueSearch } from "@/components/authority/issue-search";
import { requireAuthorityViewer } from "@/lib/authority/access";
import { listIssues } from "@/lib/authority/queries";
import { ISSUE_STATUSES, type IssueStatus } from "@/lib/authority/schema";

export const dynamic = "force-dynamic";

/*
 * Issue search across everything the viewer may see.
 *
 * The scope is computed from the session, not from the request: an admin
 * searches their whole authority, a member only their own departments. There
 * is no parameter that widens it, so a crafted URL cannot reach further than
 * the person's access already does.
 */
export default async function IssueSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const viewer = await requireAuthorityViewer();
  const { q, status } = await searchParams;

  const authorityId = viewer.authorityIds[0];
  const validStatus = ISSUE_STATUSES.includes(status as IssueStatus)
    ? (status as IssueStatus)
    : undefined;

  const issues = authorityId
    ? await listIssues({
        authorityId,
        departmentIds: viewer.isAdmin ? undefined : viewer.departmentIds,
        status: validStatus,
        search: q,
      })
    : [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">Find an issue</h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          Search by Issue ID, title or location.
          {viewer.isAdmin
            ? " You can see every issue in this authority."
            : " You can see issues in your departments."}
        </p>
      </header>

      <IssueSearch basePath="/authority/issues" />
      <IssueList issues={issues} />
    </div>
  );
}
