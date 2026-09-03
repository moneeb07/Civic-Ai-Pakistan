import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";

import { ClarificationThread } from "@/components/civic/clarification-thread";
import { requireSession } from "@/lib/session";
import { listThreadsForCitizen } from "@/lib/gov/clarification";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Messages · CivicAI" };

/** Where a citizen answers the questions departments have asked about their reports. */
export default async function CitizenMessagesPage() {
  const session = await requireSession();
  const threads = await listThreadsForCitizen(session.user.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">Messages</h1>
      <p className="mt-1 text-[0.9375rem] text-muted">
        When a department needs more detail about something you reported, they ask here.
      </p>

      {threads.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-dashed border-line-strong bg-surface p-10 text-center">
          <MessagesSquare className="mx-auto size-6 text-muted" aria-hidden="true" />
          <p className="mt-2 text-[0.9375rem] font-semibold text-ink">No messages</p>
          <p className="mt-1 text-[0.875rem] text-muted">
            You&rsquo;ll see a message here if a department has a question about your report.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {threads.map((thread) => (
            <ClarificationThread
              key={thread.id}
              thread={{
                id: thread.id,
                issueCode: thread.issueCode,
                status: thread.status,
                unreadForCitizen: thread.unreadForCitizen,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
