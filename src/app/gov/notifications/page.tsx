import Link from "next/link";
import { Bell } from "lucide-react";

import { GovShell } from "@/components/gov/gov-shell";
import { requireOfficer } from "@/lib/gov/session";
import { listNotifications } from "@/lib/gov/collaboration";
import { formatDateTime } from "@/lib/civic/format-date";

export const dynamic = "force-dynamic";

/** The officer's full inbox. The bell shows the latest few; this shows all. */
export default async function NotificationsPage() {
  const { officer } = await requireOfficer();
  const items = await listNotifications(officer.id);

  return (
    <GovShell officer={officer} backHref="/gov">
      <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">Notifications</h1>
      <p className="mt-1 text-[0.875rem] text-muted">
        Every mention and reply addressed to you. Each one opens the exact conversation.
      </p>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-dashed border-line-strong bg-surface p-10 text-center">
          <Bell className="mx-auto size-6 text-muted" aria-hidden="true" />
          <p className="mt-2 text-[0.9375rem] font-semibold text-ink">Nothing yet</p>
          <p className="mt-1 text-[0.875rem] text-muted">
            When a colleague mentions you, or a citizen answers your question, it appears here.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={
                  item.issueCode
                    ? item.conversationId
                      ? `/gov/issues/${item.issueCode}?thread=${item.conversationId}`
                      : `/gov/issues/${item.issueCode}`
                    : "/gov"
                }
                className={`block rounded-[16px] border p-4 transition-colors hover:border-civic-200 hover:bg-civic-50/40 ${
                  item.readAt ? "border-line bg-surface" : "border-civic-200 bg-civic-50/60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {item.issueCode ? (
                    <span className="font-mono text-[0.8125rem] font-bold text-civic-700">
                      {item.issueCode}
                    </span>
                  ) : null}
                  {!item.readAt ? (
                    <span className="rounded-full bg-civic-600 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">
                      New
                    </span>
                  ) : null}
                  <span className="ms-auto text-[0.75rem] text-muted">
                    {formatDateTime(new Date(item.createdAt))}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.9375rem] font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-[0.875rem] leading-relaxed text-muted">{item.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GovShell>
  );
}
