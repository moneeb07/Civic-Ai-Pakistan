import Link from "next/link";
import { Lock, MessagesSquare } from "lucide-react";

import { requireAuthorityViewer } from "@/lib/authority/access";
import { formatDate } from "@/lib/civic/format-date";
import { listRecentDiscussions } from "@/lib/authority/queries";

export const dynamic = "force-dynamic";

/*
 * Every discussion the viewer can actually reach, most recently active first.
 *
 * The filtering happens in the query, not here: a private thread the viewer is
 * not part of never reaches this page at all — not even its title, which would
 * otherwise reveal what colleagues are quietly working on.
 */
export default async function DiscussionsPage() {
  const viewer = await requireAuthorityViewer();
  const authorityId = viewer.authorityIds[0];
  if (!authorityId) return null;

  const discussions = await listRecentDiscussions(
    authorityId,
    viewer.isAdmin ? undefined : viewer.departmentIds,
    viewer.memberships.map((m) => m.memberId),
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">Discussions</h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          Recent conversations on issues you can access.
        </p>
      </header>

      {discussions.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-line-strong bg-surface p-8 text-center">
          <MessagesSquare className="mx-auto size-6 text-muted" aria-hidden="true" />
          <p className="mt-2 text-[0.9375rem] font-semibold text-ink">No discussions yet</p>
          <p className="mt-1 text-[0.875rem] text-muted">
            Open an issue and start one — no permission needed.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {discussions.map((row) => (
            <li key={row.conversationId}>
              <Link
                href={`/authority/issues/${row.issueCode}`}
                className="block rounded-[18px] border border-line bg-surface p-4 transition-colors hover:border-civic-200 hover:bg-civic-50/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[0.8125rem] font-bold tracking-tight text-civic-700">
                    {row.issueCode}
                  </span>
                  {row.visibility === "private" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-canvas px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">
                      <Lock className="size-2.5" aria-hidden="true" />
                      Private
                    </span>
                  ) : null}
                </div>

                <p className="mt-1.5 text-[0.9375rem] font-semibold leading-snug text-ink">
                  {row.title}
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-muted">{row.issueTitle}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-muted">
                  <span>
                    {row.messageCount} {row.messageCount === 1 ? "message" : "messages"}
                  </span>
                  {row.departmentName ? <span>{row.departmentName}</span> : null}
                  {row.lastMessageAt ? (
                    <span>Last activity {formatDate(row.lastMessageAt)}</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
