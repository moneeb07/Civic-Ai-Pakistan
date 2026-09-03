"use client";

import * as React from "react";
import { MessagesSquare, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { InlineError } from "@/components/gov/states";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import { formatTimestamp } from "@/lib/gov/format";
import type { ChatMessageDto, ChatParticipantDto, OfficerRole } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const t = getDictionary();

/*
 * The per-complaint group chat.
 *
 * Membership is not chosen here — it is derived server-side from who is
 * responsible: the organization head, the head of the department the
 * complaint was routed to, and everyone assigned to it. The panel just shows
 * that list so nobody is unclear about who can read what they write.
 *
 * Updates arrive by polling, not WebSockets. Real-time transport was out of
 * scope for the portal, and a 10-second poll that asks only for messages newer
 * than the last one it holds is honest about that: it is visibly a poll, it
 * costs one small response per tick, and it degrades to "refresh the page"
 * rather than to a silently dead socket. Polling pauses while the tab is
 * hidden, so a forgotten tab is not a standing request every ten seconds.
 */

const POLL_MS = 10_000;

const REASON_LABEL: Record<ChatParticipantDto["reason"], string> = {
  organization_head: t.gov.chat.reasonOrgHead,
  department_head: t.gov.chat.reasonDeptHead,
  assignee: t.gov.chat.reasonAssignee,
};

export function ChatPanel({
  reportId,
  currentOfficerId,
  initialMessages,
  initialParticipants,
  canPost,
}: {
  reportId: string;
  currentOfficerId: string;
  initialMessages: ChatMessageDto[];
  initialParticipants: ChatParticipantDto[];
  canPost: boolean;
}) {
  const [messages, setMessages] = React.useState(initialMessages);
  const [participants, setParticipants] = React.useState(initialParticipants);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const listRef = React.useRef<HTMLDivElement>(null);

  /*
   * The poll needs the newest message's timestamp, but must not re-subscribe
   * every time a message arrives. Mirroring `messages` into a ref inside an
   * effect (never during render) gives the interval a stable way to read the
   * current value without becoming a dependency of it.
   */
  const messagesRef = React.useRef(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** Merge by id so a polled message and its optimistic twin never both render. */
  const merge = React.useCallback((incoming: ChatMessageDto[]) => {
    if (incoming.length === 0) return;
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const message of incoming) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      // Nothing to ask for while the tab is in the background.
      if (document.hidden) return;

      const latest = messagesRef.current.at(-1)?.createdAt;
      try {
        const payload = await api.getChat(reportId, latest);
        if (cancelled) return;
        merge(payload.messages);
        setParticipants(payload.participants);
      } catch {
        // A failed poll is not worth interrupting the conversation over; the
        // next tick retries, and posting surfaces a real error of its own.
      }
    }

    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reportId, merge]);

  // Keep the newest message in view as the conversation grows.
  React.useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    try {
      const message = await api.postChatMessage(reportId, body);
      merge([message]);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card id="chat">
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardEyebrow>{t.gov.chat.title}</CardEyebrow>
            <p className="mt-1.5 text-[0.8125rem] text-muted">{t.gov.chat.subtitle}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[0.6875rem] font-semibold text-muted">
            <MessagesSquare className="size-3.5" aria-hidden="true" />
            {messages.length}
          </span>
        </div>

        <ParticipantList participants={participants} currentOfficerId={currentOfficerId} />

        <div
          ref={listRef}
          className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-[18px] border border-line bg-canvas p-4"
          role="log"
          aria-live="polite"
          aria-label={t.gov.chat.title}
        >
          {messages.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[0.9375rem] font-semibold text-ink">{t.gov.chat.emptyTitle}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
                {t.gov.chat.emptyBody}
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                mine={message.authorOfficerId === currentOfficerId}
              />
            ))
          )}
        </div>

        {canPost ? (
          <form onSubmit={send} className="mt-4">
            {error ? <InlineError message={error} /> : null}

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="chat-draft" className="sr-only">
                  {t.gov.chat.placeholder}
                </label>
                <textarea
                  id="chat-draft"
                  rows={2}
                  value={draft}
                  placeholder={t.gov.chat.placeholder}
                  disabled={sending}
                  onChange={(event) => setDraft(event.target.value)}
                  // Enter sends, Shift+Enter breaks the line — the convention
                  // every chat uses, so nobody has to be told.
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(event);
                    }
                  }}
                  className="w-full resize-y rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 py-3 text-base text-ink shadow-[var(--shadow-field)] transition-colors placeholder:text-muted/70 focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas"
                />
              </div>

              <Button type="submit" disabled={draft.trim().length === 0} loading={sending}>
                <Send className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">
                  {sending ? t.gov.chat.sending : t.gov.chat.send}
                </span>
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 rounded-[18px] border border-line bg-canvas px-4 py-3 text-[0.8125rem] leading-snug text-muted">
            {t.gov.chat.readOnlyNotice}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function ParticipantList({
  participants,
  currentOfficerId,
}: {
  participants: ChatParticipantDto[];
  currentOfficerId: string;
}) {
  return (
    <div className="mt-4">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {t.gov.chat.participantsEyebrow}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {participants.map((person) => (
          <li
            key={person.officerId}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem]",
              person.officerId === currentOfficerId
                ? "border-civic-200 bg-civic-50 text-civic-700"
                : "border-line bg-surface text-muted",
            )}
          >
            <span className="font-semibold">
              {person.officerId === currentOfficerId ? t.gov.chat.you : person.name}
            </span>
            <span className="opacity-70">{REASON_LABEL[person.reason]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Message({ message, mine }: { message: ChatMessageDto; mine: boolean }) {
  return (
    <div className={cn("flex", mine && "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[16px] px-3.5 py-2.5",
          mine ? "bg-civic-600 text-white" : "border border-line bg-surface",
        )}
      >
        <p
          className={cn(
            "text-[0.6875rem] font-semibold",
            mine ? "text-white/75" : "text-muted",
          )}
        >
          {mine ? t.gov.chat.you : message.authorName}
          {message.authorRole ? ` · ${t.gov.roles[message.authorRole as OfficerRole]}` : ""}
        </p>
        {/* whitespace-pre-line keeps the line breaks someone typed deliberately. */}
        <p
          className={cn(
            "mt-1 whitespace-pre-line break-words text-[0.875rem] leading-relaxed",
            mine ? "text-white" : "text-ink/85",
          )}
        >
          {message.body}
        </p>
        <p className={cn("mt-1 text-[0.6875rem]", mine ? "text-white/60" : "text-muted")}>
          {formatTimestamp(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
