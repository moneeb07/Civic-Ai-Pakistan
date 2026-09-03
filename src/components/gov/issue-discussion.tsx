"use client";

import * as React from "react";
import { Lock, MessageSquare, Plus, Send, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { searchMentionable } from "@/lib/gov/mentions";
import { formatDateTime } from "@/lib/civic/format-date";

/*
 * Issue discussion, built to feel like an ordinary team chat rather than a
 * ticketing system — because that is what it replaces. The whole reason this
 * exists is so coordinating on a civic problem never means leaving for email
 * or WhatsApp.
 *
 * There is no rank gate on any control here. Every officer in the department
 * can open a thread, post, and pull a colleague in. The only real boundary is
 * a private thread's participant list, and that is enforced server-side, not
 * by hiding buttons.
 */

interface OfficerOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  visibility: "department" | "private";
  messageCount: number;
  participantCount: number;
  lastMessageAt: string | null;
}

interface Message {
  id: string;
  body: string;
  officerId: string;
  officerName: string;
  role: string;
  mentions: { officerId: string; name: string }[];
  createdAt: string;
}

export function IssueDiscussion({
  issueCode,
  conversations,
  roster,
  currentOfficerId,
  initialThreadId,
}: {
  issueCode: string;
  conversations: ConversationSummary[];
  roster: OfficerOption[];
  currentOfficerId: string;
  /** Set when arriving from a notification — opens that exact thread. */
  initialThreadId?: string;
}) {
  const [threads, setThreads] = React.useState(conversations);
  const [activeId, setActiveId] = React.useState<string | null>(
    initialThreadId ?? conversations[0]?.id ?? null,
  );
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [participants, setParticipants] = React.useState<string[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [loaded, setLoaded] = React.useState<{ id: string; token: number } | null>(null);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const loading = activeId !== null && (loaded?.id !== activeId || loaded.token !== reloadToken);

  React.useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/gov/conversations/${activeId}/messages`);
        const payload = await response.json();
        if (!cancelled && payload.success) setMessages(payload.data);
      } catch {
        // Keep the previous thread on screen rather than blanking it.
      } finally {
        if (!cancelled) setLoaded({ id: activeId, token: reloadToken });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, reloadToken]);

  return (
    <section className="rounded-[20px] border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <MessageSquare className="size-4 text-civic-700" aria-hidden="true" />
        <h2 className="text-[0.9375rem] font-semibold text-ink">Discussion</h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[0.8125rem] font-medium text-ink transition-colors hover:border-civic-200 hover:bg-civic-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New thread
        </button>
      </header>

      {creating ? (
        <NewThreadForm
          issueCode={issueCode}
          roster={roster.filter((o) => o.id !== currentOfficerId)}
          onCreated={(thread) => {
            setThreads((list) => [...list, thread]);
            setActiveId(thread.id);
            setCreating(false);
          }}
        />
      ) : null}

      {threads.length === 0 ? (
        <p className="px-4 py-10 text-center text-[0.875rem] text-muted">
          No discussion yet. Start one — you don&rsquo;t need anyone&rsquo;s permission.
        </p>
      ) : (
        <div className="grid md:grid-cols-[14rem_1fr]">
          <ul className="border-b border-line p-2 md:border-b-0 md:border-e">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(thread.id)}
                  className={cn(
                    "w-full rounded-[12px] px-3 py-2.5 text-start transition-colors",
                    thread.id === activeId ? "bg-civic-50 text-civic-900" : "text-ink hover:bg-canvas",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[0.875rem] font-medium">
                    {thread.visibility === "private" ? (
                      <Lock className="size-3 shrink-0 text-muted" aria-hidden="true" />
                    ) : null}
                    <span className="truncate">{thread.title}</span>
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-muted">
                    {thread.messageCount} {thread.messageCount === 1 ? "message" : "messages"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {active ? (
              <Thread
                conversation={active}
                messages={messages}
                loading={loading}
                roster={roster}
                currentOfficerId={currentOfficerId}
                participants={participants}
                onParticipants={setParticipants}
                onChanged={() => setReloadToken((t) => t + 1)}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function Thread({
  conversation,
  messages,
  loading,
  roster,
  currentOfficerId,
  participants,
  onParticipants,
  onChanged,
}: {
  conversation: ConversationSummary;
  messages: Message[];
  loading: boolean;
  roster: OfficerOption[];
  currentOfficerId: string;
  participants: string[];
  onParticipants: (ids: string[]) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="flex min-h-[22rem] flex-col">
      {conversation.visibility === "private" ? (
        <div className="border-b border-line bg-civic-50/50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Lock className="size-3.5 text-civic-700" aria-hidden="true" />
            <p className="text-[0.75rem] text-civic-900">
              <span className="font-semibold">Private thread.</span>{" "}
              {conversation.participantCount} participants
            </p>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setAdding((a) => !a)}
              className="inline-flex items-center gap-1 rounded-full border border-civic-200 bg-surface px-2.5 py-1 text-[0.75rem] font-medium text-civic-700 hover:bg-civic-50"
            >
              <UserPlus className="size-3" aria-hidden="true" />
              Add someone
            </button>
          </div>

          {adding ? (
            <AddParticipant
              conversationId={conversation.id}
              roster={roster.filter((o) => o.id !== currentOfficerId && !participants.includes(o.id))}
              onAdded={(id) => {
                onParticipants([...participants, id]);
                setAdding(false);
                onChanged();
              }}
            />
          ) : null}

          {/*
            Said plainly, because it is what people worry about when adding
            someone late: they are not joining halfway, they get the lot.
          */}
          <p className="mt-1 text-[0.6875rem] text-civic-900/60">
            Anyone added here can read this thread&rsquo;s full history.
          </p>
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading && messages.length === 0 ? (
          <p className="text-[0.875rem] text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-[0.875rem] text-muted">No messages yet. Start the discussion below.</p>
        ) : (
          messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              isSelf={message.officerId === currentOfficerId}
            />
          ))
        )}
      </div>

      <Composer conversationId={conversation.id} roster={roster} onSent={onChanged} />
    </div>
  );
}

function MessageRow({ message, isSelf }: { message: Message; isSelf: boolean }) {
  return (
    <div className="flex gap-2.5">
      {/*
        A monogram rather than a photograph. These are civil servants on a
        government system; a coloured initial identifies a colleague in a
        thread perfectly well without inventing a likeness, and the tint is
        derived from the name so the same person is the same colour on every
        screen.
      */}
      <Avatar name={message.officerName} size="sm" className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[0.8125rem] font-semibold text-ink">
            {message.officerName}
            {isSelf ? <span className="font-normal text-muted"> (you)</span> : null}
          </span>
          <span className="text-[0.6875rem] text-muted">
            {formatDateTime(new Date(message.createdAt))}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink/90">
          {highlight(message.body, message.mentions)}
        </p>
      </div>
    </div>
  );
}

/**
 * Highlights only the mentions the SERVER actually resolved.
 *
 * A name that did not resolve to a real officer of this department stays plain
 * text, so the styling never implies somebody was notified when they were not.
 */
function highlight(body: string, mentions: { name: string }[]): React.ReactNode {
  if (mentions.length === 0) return body;

  const names = mentions.flatMap((m) => [m.name, m.name.split(" ")[0]]);
  names.sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escaped.join("|")})`, "g");

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(body.slice(last, index));
    parts.push(
      <span key={`${index}`} className="rounded bg-civic-100 px-1 font-medium text-civic-800">
        {match[0]}
      </span>,
    );
    last = index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function Composer({
  conversationId,
  roster,
  onSent,
}: {
  conversationId: string;
  roster: OfficerOption[];
  onSent: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // The @query currently being typed, if the caret sits inside one.
  const query = React.useMemo(() => {
    const match = /@([\p{L}\p{N}.'-]*)$/u.exec(body);
    return match ? match[1] : null;
  }, [body]);

  const suggestions = React.useMemo(() => {
    if (query === null) return [];
    return searchMentionable(
      query,
      roster.map((o) => ({ id: o.id, displayName: o.name, memberCode: o.email })),
    );
  }, [query, roster]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/gov/conversations/${conversationId}/messages`, {
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
    <div className="relative border-t border-line p-3">
      {suggestions.length > 0 ? (
        <ul className="absolute bottom-full start-3 mb-1 max-h-52 w-64 overflow-y-auto rounded-[14px] border border-line bg-surface p-1 shadow-lg">
          {suggestions.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  setBody((c) => c.replace(/@([\p{L}\p{N}.'-]*)$/u, `@${option.displayName} `));
                  ref.current?.focus();
                }}
                className="w-full rounded-[10px] px-2.5 py-1.5 text-start text-[0.8125rem] hover:bg-civic-50"
              >
                {option.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the convention
            // everyone already has in their fingers from every other chat app.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Write a message. Type @ to mention a colleague."
          aria-label="Message"
          className="min-h-11 flex-1 resize-y rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 py-2 text-[0.875rem] text-ink outline-none placeholder:text-muted focus:border-civic-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !body.trim()}
          aria-label="Send"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-field)] bg-civic-600 px-3 text-white transition-colors hover:bg-civic-700 disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function AddParticipant({
  conversationId,
  roster,
  onAdded,
}: {
  conversationId: string;
  roster: OfficerOption[];
  onAdded: (officerId: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function add(officerId: string) {
    setBusy(true);
    try {
      await fetch(`/api/gov/conversations/${conversationId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officerId }),
      });
      onAdded(officerId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-[12px] border border-line bg-surface p-1.5">
      {roster.length === 0 ? (
        <li className="px-2 py-1.5 text-[0.8125rem] text-muted">
          Everyone in the department is already here.
        </li>
      ) : (
        roster.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => add(o.id)}
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-start text-[0.8125rem] hover:bg-civic-50 disabled:opacity-50"
            >
              <Avatar name={o.name} size="sm" />
              {o.name}
            </button>
          </li>
        ))
      )}
    </ul>
  );
}

function NewThreadForm({
  issueCode,
  roster,
  onCreated,
}: {
  issueCode: string;
  roster: OfficerOption[];
  onCreated: (thread: ConversationSummary) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [visibility, setVisibility] = React.useState<"department" | "private">("department");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  async function create() {
    setBusy(true);
    try {
      const response = await fetch(`/api/gov/issues/${issueCode}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, visibility, participantOfficerIds: selected }),
      });
      const payload = await response.json();
      if (payload.success) {
        onCreated({
          id: payload.data.id,
          title,
          visibility,
          messageCount: 0,
          participantCount: selected.length + 1,
          lastMessageAt: null,
        });
        setTitle("");
        setSelected([]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line bg-canvas/60 p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is this thread about?"
        aria-label="Thread title"
        className="w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-civic-500"
      />

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {(["department", "private"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setVisibility(value)}
            aria-pressed={visibility === value}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
              visibility === value
                ? "border-civic-600 bg-civic-600 text-white"
                : "border-line-strong bg-surface text-muted hover:bg-civic-50",
            )}
          >
            {value === "department" ? "Whole department" : "Private"}
          </button>
        ))}
      </div>

      {visibility === "private" ? (
        <div className="mt-2.5">
          <p className="text-[0.75rem] text-muted">
            Choose who can see it. You are included automatically.
          </p>
          <div className="mt-1.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {roster.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSelected((c) => (on ? c.filter((id) => id !== o.id) : [...c, o.id]))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors",
                    on
                      ? "border-civic-600 bg-civic-100 text-civic-900"
                      : "border-line-strong bg-surface text-muted hover:bg-civic-50",
                  )}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={create}
        disabled={busy || title.trim().length < 2}
        className="mt-3 inline-flex min-h-10 items-center rounded-[var(--radius-field)] bg-civic-600 px-4 text-[0.875rem] font-semibold text-white transition-colors hover:bg-civic-700 disabled:opacity-50"
      >
        Create thread
      </button>
    </div>
  );
}
