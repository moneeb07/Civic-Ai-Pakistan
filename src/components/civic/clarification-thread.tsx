"use client";

import * as React from "react";
import { Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/civic/format-date";

/*
 * The citizen's side of a department's question.
 *
 * Deliberately the plainest screen in the app. Somebody who reported a broken
 * streetlight and got asked "which pole?" should be able to answer in one tap
 * and one sentence — no status vocabulary, no case-handling language, and no
 * sign that a department chat exists at all.
 */

interface ThreadDto {
  id: string;
  issueCode: string;
  status: "open" | "closed";
  unreadForCitizen: number;
}

interface Message {
  id: string;
  senderKind: "officer" | "citizen";
  authorName: string;
  body: string;
  createdAt: string;
}

export function ClarificationThread({ thread }: { thread: ThreadDto }) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [token, setToken] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/citizen/clarifications/${thread.id}/messages`);
        const payload = await response.json();
        /*
         * The route returns { issueCode, status, messages } — not a bare
         * array. Assigning `payload.data` straight into message state made
         * `messages` the wrapper object, which has no .map, and crashed the
         * first time this citizen actually had a thread with a message in it.
         * See src/app/api/citizen/clarifications/[threadId]/messages/route.ts.
         */
        if (!cancelled && payload.success) setMessages(payload.data.messages ?? []);
      } catch {
        // Leave what is on screen; a retry happens on the next send.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [thread.id, token]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/citizen/clarifications/${thread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if ((await response.json()).success) {
        setBody("");
        setToken((t) => t + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-[0.875rem] font-semibold text-ink">
          About your report {thread.issueCode}
        </span>
        {thread.unreadForCitizen > 0 ? (
          <span className="rounded-full bg-civic-600 px-2 py-0.5 text-[0.6875rem] font-bold text-white">
            {thread.unreadForCitizen} new
          </span>
        ) : null}
      </header>

      <div className="space-y-3 p-4">
        {!loaded ? (
          <p className="text-[0.875rem] text-muted">Loading…</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-[16px] px-3.5 py-2.5",
                message.senderKind === "citizen"
                  ? "ms-auto bg-civic-600 text-white"
                  : "bg-canvas text-ink",
              )}
            >
              <p className="text-[0.6875rem] font-semibold opacity-70">
                {/*
                  Staff names are not shown to the public: the case belongs to
                  the department, officers move on, and a named individual
                  invites people to chase a person instead of an office.
                */}
                {message.senderKind === "citizen" ? "You" : "The department"}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                {message.body}
              </p>
              <p className="mt-1 text-[0.6875rem] opacity-60">
                {formatDateTime(new Date(message.createdAt))}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            aria-label="Your answer"
            placeholder="Type your answer…"
            className="min-h-11 flex-1 resize-y rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none placeholder:text-muted focus:border-civic-500"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !body.trim()}
            aria-label="Send answer"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-field)] bg-civic-600 px-4 text-white transition-colors hover:bg-civic-700 disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
