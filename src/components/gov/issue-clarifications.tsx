"use client";

import * as React from "react";
import { MessageCircleQuestion, Send, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/civic/format-date";

/*
 * Asking the person who reported the problem.
 *
 * Officers routinely need one detail only the reporter has — which side of the
 * road, is the water still standing, how deep is it. Today that means the case
 * stalls or the officer guesses. This panel is the way to just ask.
 *
 * It is rendered as a visibly separate section from the internal discussion,
 * with the citizen's name on every thread, because the one mistake that would
 * really matter here is an officer typing an internal remark into a box a
 * member of the public can read. The colour, the icon and the "the reporter
 * will see this" line under the composer all exist to make the audience of
 * whatever you are typing unmistakable.
 */

interface ReportOption {
  reportId: string;
  title: string | null;
  locationLabel: string | null;
  createdAt: string;
}

interface ThreadDto {
  id: string;
  reportId: string;
  citizenName: string | null;
  status: "open" | "closed";
  messageCount: number;
  unreadForOfficer: number;
}

interface ClarificationMessage {
  id: string;
  senderKind: "officer" | "citizen";
  authorName: string;
  body: string;
  createdAt: string;
}

export function IssueClarifications({
  issueCode,
  reports,
  threads: initialThreads,
}: {
  issueCode: string;
  reports: ReportOption[];
  threads: ThreadDto[];
}) {
  const [threads, setThreads] = React.useState(initialThreads);
  const [activeId, setActiveId] = React.useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = React.useState<ClarificationMessage[]>([]);
  const [asking, setAsking] = React.useState(false);
  const [token, setToken] = React.useState(0);

  const active = threads.find((t) => t.id === activeId) ?? null;

  React.useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/gov/clarifications/${activeId}/messages`);
        const payload = await response.json();
        if (!cancelled && payload.success) {
          setMessages(payload.data);
          // Reading the thread clears its badge, matching what the server just did.
          setThreads((list) =>
            list.map((t) => (t.id === activeId ? { ...t, unreadForOfficer: 0 } : t)),
          );
        }
      } catch {
        // Leave whatever is on screen rather than blanking the thread.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, token]);

  async function refreshThreads() {
    const response = await fetch(`/api/gov/issues/${issueCode}/clarifications`);
    const payload = await response.json();
    if (payload.success) setThreads(payload.data);
  }

  return (
    <section className="rounded-[20px] border border-amber-200 bg-amber-50/40">
      <header className="flex flex-wrap items-center gap-2 border-b border-amber-200 px-4 py-3">
        <MessageCircleQuestion className="size-4 text-amber-700" aria-hidden="true" />
        <h2 className="text-[0.9375rem] font-semibold text-ink">Questions to reporters</h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAsking((a) => !a)}
          className="min-h-9 rounded-full border border-amber-300 bg-surface px-3 text-[0.8125rem] font-medium text-amber-800 transition-colors hover:bg-amber-100"
        >
          Ask a reporter
        </button>
      </header>

      <p className="px-4 pt-3 text-[0.75rem] leading-relaxed text-amber-900/70">
        Anything sent here goes to the citizen who filed that report. Your department&rsquo;s
        internal discussion stays private.
      </p>

      {asking ? (
        <AskForm
          issueCode={issueCode}
          reports={reports}
          onAsked={async (threadId) => {
            setAsking(false);
            await refreshThreads();
            setActiveId(threadId);
            setToken((t) => t + 1);
          }}
        />
      ) : null}

      {threads.length === 0 ? (
        <p className="px-4 py-8 text-center text-[0.875rem] text-amber-900/70">
          No questions asked yet.
        </p>
      ) : (
        <div className="grid p-3 md:grid-cols-[13rem_1fr] md:gap-3">
          <ul className="space-y-1">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(thread.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-start text-[0.8125rem] transition-colors",
                    thread.id === activeId
                      ? "bg-amber-100 text-amber-900"
                      : "text-ink hover:bg-amber-100/50",
                  )}
                >
                  <UserRound className="size-3.5 shrink-0 text-amber-700" aria-hidden="true" />
                  <span className="truncate font-medium">{thread.citizenName ?? "Reporter"}</span>
                  {thread.unreadForOfficer > 0 ? (
                    <span className="ms-auto rounded-full bg-amber-600 px-1.5 text-[0.625rem] font-bold text-white">
                      {thread.unreadForOfficer}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          {active ? (
            <div className="mt-3 flex min-h-[16rem] flex-col rounded-[16px] border border-amber-200 bg-surface md:mt-0">
              <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
                {messages.length === 0 ? (
                  <p className="text-[0.875rem] text-muted">Loading…</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[85%] rounded-[14px] px-3 py-2",
                        message.senderKind === "officer"
                          ? "ms-auto bg-civic-600 text-white"
                          : "bg-canvas text-ink",
                      )}
                    >
                      <p className="text-[0.6875rem] font-semibold opacity-70">
                        {message.senderKind === "officer"
                          ? "Your department"
                          : (active.citizenName ?? "Reporter")}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[0.875rem] leading-relaxed">
                        {message.body}
                      </p>
                      <p className="mt-1 text-[0.625rem] opacity-60">
                        {formatDateTime(new Date(message.createdAt))}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <Reply threadId={active.id} onSent={() => setToken((t) => t + 1)} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Reply({ threadId, onSent }: { threadId: string; onSent: () => void }) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/gov/clarifications/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if ((await response.json()).success) {
        setBody("");
        onSent();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-amber-200 p-2.5">
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          aria-label="Reply to the reporter"
          placeholder="Reply to the reporter…"
          className="min-h-11 flex-1 resize-y rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none placeholder:text-muted focus:border-civic-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !body.trim()}
          aria-label="Send to reporter"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-field)] bg-civic-600 px-3 text-white hover:bg-civic-700 disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 text-[0.6875rem] text-amber-900/70">The reporter will see this message.</p>
    </div>
  );
}

function AskForm({
  issueCode,
  reports,
  onAsked,
}: {
  issueCode: string;
  reports: ReportOption[];
  onAsked: (threadId: string) => void;
}) {
  const [reportId, setReportId] = React.useState(reports[0]?.reportId ?? "");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function ask() {
    setBusy(true);
    try {
      const response = await fetch(`/api/gov/issues/${issueCode}/clarifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, body }),
      });
      const payload = await response.json();
      if (payload.success) {
        setBody("");
        onAsked(payload.data.threadId);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m-3 rounded-[16px] border border-amber-200 bg-surface p-3.5">
      {/*
        The issue groups several reports from several people, so "the reporter"
        is ambiguous until one is picked. The choice is explicit rather than
        defaulted silently, since it decides who receives the message.
      */}
      <label className="block text-[0.75rem] font-semibold text-ink" htmlFor="clarify-report">
        Which report?
      </label>
      <select
        id="clarify-report"
        value={reportId}
        onChange={(e) => setReportId(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-civic-500"
      >
        {reports.map((report) => (
          <option key={report.reportId} value={report.reportId}>
            {report.title ?? "Untitled report"}
            {report.locationLabel ? ` — ${report.locationLabel}` : ""}
          </option>
        ))}
      </select>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        aria-label="Your question"
        placeholder="What do you need to know? e.g. Is the water still standing outside your gate?"
        className="mt-2.5 w-full resize-y rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none placeholder:text-muted focus:border-civic-500"
      />

      <button
        type="button"
        onClick={ask}
        disabled={busy || !reportId || body.trim().length < 2}
        className="mt-2.5 min-h-10 rounded-[var(--radius-field)] bg-civic-600 px-4 text-[0.875rem] font-semibold text-white transition-colors hover:bg-civic-700 disabled:opacity-50"
      >
        Send question
      </button>
    </div>
  );
}
