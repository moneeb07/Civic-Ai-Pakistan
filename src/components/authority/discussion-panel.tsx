"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, MessageSquare, Plus, Send, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchMentionable } from "@/lib/authority/mentions";
import type { ConversationSummary, MemberSummary } from "@/lib/authority/queries";

/*
 * Issue-based messaging.
 *
 * Modelled on an ordinary team chat rather than a ticketing system, because
 * that is how the people using it already work. There is no rank gate on any
 * control here: every member of the department can open a thread, post, and
 * mention anyone. The only real boundary is a private thread's participant
 * list, and that is enforced on the server, not by hiding buttons.
 */

interface Message {
  id: string;
  body: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  mentions: { memberId: string; displayName: string }[];
  createdAt: string;
}

interface Participant {
  memberId: string;
  displayName: string;
  memberCode: string;
  addedAt: string;
}

export function DiscussionPanel({
  issueCode,
  conversations,
  members,
  viewerMemberIds,
}: {
  issueCode: string;
  conversations: ConversationSummary[];
  members: MemberSummary[];
  viewerMemberIds: string[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(
    conversations[0]?.id ?? null,
  );
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [addable, setAddable] = React.useState<MemberSummary[]>([]);
  const [creating, setCreating] = React.useState(false);

  /*
   * Bumped by anything that changes a thread (a sent message, an added
   * participant) to ask the effect below for a fresh read.
   */
  const [reloadToken, setReloadToken] = React.useState(0);
  /** Which thread the state currently holds, and at which token. */
  const [loaded, setLoaded] = React.useState<{ id: string; token: number } | null>(
    null,
  );

  const active = conversations.find((c) => c.id === activeId) ?? null;

  /*
   * Loading is DERIVED rather than stored. Setting a loading flag
   * synchronously inside the effect would set state during render and trigger
   * a cascading re-render; comparing what is loaded against what is wanted
   * says the same thing with no extra state at all.
   */
  const loading =
    activeId !== null && (loaded?.id !== activeId || loaded.token !== reloadToken);

  React.useEffect(() => {
    if (!activeId) return;

    // Guards against a slow response for a thread the reader has left.
    let cancelled = false;

    void (async () => {
      try {
        const [messageResponse, participantResponse] = await Promise.all([
          fetch(`/api/authority/conversations/${activeId}/messages`),
          fetch(`/api/authority/conversations/${activeId}/participants`),
        ]);

        const messagePayload = await messageResponse.json();
        const participantPayload = await participantResponse.json();
        if (cancelled) return;

        if (messagePayload.success) setMessages(messagePayload.data);
        if (participantPayload.success) {
          setParticipants(participantPayload.data.participants);
          setAddable(participantPayload.data.addable);
        }
      } catch {
        // Leaving the previous thread on screen beats blanking it.
      } finally {
        // Marked loaded either way, so a failed fetch does not spin forever.
        if (!cancelled) setLoaded({ id: activeId, token: reloadToken });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, reloadToken]);

  return (
    <div className="rounded-[20px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <MessageSquare className="size-4 text-civic-700" aria-hidden="true" />
        <h2 className="text-[0.9375rem] font-semibold text-ink">Discussions</h2>
        <span className="flex-1" />
        <Button
          variant="secondary"
          onClick={() => setCreating((open) => !open)}
          className="min-h-9 px-3 text-[0.8125rem]"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New discussion
        </Button>
      </div>

      {creating ? (
        <NewConversationForm
          issueCode={issueCode}
          members={members}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      {conversations.length === 0 ? (
        <p className="px-4 py-8 text-center text-[0.875rem] text-muted">
          No discussions yet. Start one to coordinate on this issue.
        </p>
      ) : (
        <div className="grid md:grid-cols-[15rem_1fr]">
          <ul className="border-b border-line p-2 md:border-b-0 md:border-e">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(conversation.id)}
                  className={cn(
                    "w-full rounded-[12px] px-3 py-2.5 text-start transition-colors",
                    conversation.id === activeId
                      ? "bg-civic-50 text-civic-900"
                      : "text-ink hover:bg-canvas",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[0.875rem] font-medium">
                    {conversation.visibility === "private" ? (
                      <Lock className="size-3 shrink-0 text-muted" aria-hidden="true" />
                    ) : null}
                    {conversation.title}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-muted">
                    {conversation.messageCount}{" "}
                    {conversation.messageCount === 1 ? "message" : "messages"}
                    {conversation.visibility === "private"
                      ? ` · ${conversation.participantCount} participants`
                      : ""}
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
                participants={participants}
                addable={addable}
                members={members}
                viewerMemberIds={viewerMemberIds}
                loading={loading}
                onChanged={() => {
                  setReloadToken((token) => token + 1);
                  router.refresh();
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Thread({
  conversation,
  messages,
  participants,
  addable,
  members,
  viewerMemberIds,
  loading,
  onChanged,
}: {
  conversation: ConversationSummary;
  messages: Message[];
  participants: Participant[];
  addable: MemberSummary[];
  members: MemberSummary[];
  viewerMemberIds: string[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="flex min-h-[24rem] flex-col">
      {conversation.visibility === "private" ? (
        <div className="border-b border-line bg-civic-50/50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="size-3.5 text-civic-700" aria-hidden="true" />
            <p className="text-[0.75rem] text-civic-900">
              <span className="font-semibold">Private discussion.</span>{" "}
              {participants.map((p) => p.displayName).join(", ")}
            </p>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setAdding((open) => !open)}
              className="inline-flex items-center gap-1 rounded-full border border-civic-200 bg-surface px-2.5 py-1 text-[0.75rem] font-medium text-civic-700 hover:bg-civic-50"
            >
              <UserPlus className="size-3" aria-hidden="true" />
              Add someone
            </button>
          </div>

          {adding ? (
            <AddParticipant
              conversationId={conversation.id}
              addable={addable}
              onDone={() => {
                setAdding(false);
                onChanged();
              }}
            />
          ) : null}

          {/*
            Said plainly, because it is the thing people worry about when they
            add someone late: the new participant is not joining halfway, they
            are joining the whole conversation.
          */}
          <p className="mt-1 text-[0.6875rem] text-civic-900/60">
            Anyone added here can read the full history of this discussion.
          </p>
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading && messages.length === 0 ? (
          <p className="text-[0.875rem] text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-[0.875rem] text-muted">
            No messages yet. Start the discussion below.
          </p>
        ) : (
          messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              isViewer={viewerMemberIds.includes(message.memberId)}
            />
          ))
        )}
      </div>

      <Composer
        conversationId={conversation.id}
        members={members}
        onSent={onChanged}
      />
    </div>
  );
}

function MessageRow({ message, isViewer }: { message: Message; isViewer: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[0.8125rem] font-semibold text-ink">
          {message.memberName}
          {isViewer ? <span className="font-normal text-muted"> (you)</span> : null}
        </span>
        <span className="font-mono text-[0.6875rem] text-muted">{message.memberCode}</span>
        <span className="text-[0.6875rem] text-muted">
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink/90">
        {highlightMentions(message.body, message.mentions)}
      </p>
    </div>
  );
}

/**
 * Highlights the mentions the SERVER resolved, not everything that looks like
 * an @handle. A name that did not resolve to a real member of this department
 * stays plain text, so the styling never implies somebody was notified when
 * they were not.
 */
function highlightMentions(
  body: string,
  mentions: { displayName: string }[],
): React.ReactNode {
  if (mentions.length === 0) return body;

  const names = mentions.flatMap((mention) => {
    const full = mention.displayName;
    return [full, full.split(" ")[0]];
  });
  // Longest first, so "Ahmed Nawaz" wins over "Ahmed".
  names.sort((a, b) => b.length - a.length);

  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escaped.join("|")})`, "g");

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(body.slice(lastIndex, index));
    parts.push(
      <span
        key={`${index}-${match[0]}`}
        className="rounded bg-civic-100 px-1 font-medium text-civic-800"
      >
        {match[0]}
      </span>,
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

/*
 * The composer, with @mention autocomplete over the department roster.
 *
 * The list it offers is the same roster the server will resolve against, so
 * what the picker shows and what actually becomes a mention cannot diverge.
 */
function Composer({
  conversationId,
  members,
  onSent,
}: {
  conversationId: string;
  members: MemberSummary[];
  onSent: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // The @query currently being typed, if the caret is inside one.
  const mentionQuery = React.useMemo(() => {
    const match = /@([\p{L}\p{N}.'-]*)$/u.exec(body);
    return match ? match[1] : null;
  }, [body]);

  const suggestions = React.useMemo(() => {
    if (mentionQuery === null) return [];
    return searchMentionable(
      mentionQuery,
      members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        memberCode: m.memberCode,
      })),
    );
  }, [mentionQuery, members]);

  function insertMention(name: string) {
    setBody((current) => current.replace(/@([\p{L}\p{N}.'-]*)$/u, `@${name} `));
    inputRef.current?.focus();
  }

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/authority/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? "That didn't send.");
        setBusy(false);
        return;
      }

      setBody("");
      onSent();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative border-t border-line p-3">
      {suggestions.length > 0 ? (
        <ul className="absolute bottom-full start-3 mb-1 max-h-56 w-64 overflow-y-auto rounded-[14px] border border-line bg-surface p-1 shadow-lg">
          {suggestions.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => insertMention(member.displayName)}
                className="w-full rounded-[10px] px-2.5 py-1.5 text-start hover:bg-civic-50"
              >
                <span className="block text-[0.8125rem] font-medium text-ink">
                  {member.displayName}
                </span>
                <span className="block font-mono text-[0.6875rem] text-muted">
                  {member.memberCode}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line — the convention
            // everyone using a chat app already has in their fingers.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Write a message. Type @ to mention a colleague."
          aria-label="Message"
          className="min-h-11 flex-1 resize-y rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 py-2 text-[0.875rem] text-ink outline-none placeholder:text-muted focus:border-civic-500"
        />
        <Button
          onClick={send}
          loading={busy}
          disabled={!body.trim()}
          className="min-h-11 px-3"
          aria-label="Send message"
        >
          {!busy ? <Send className="size-4" aria-hidden="true" /> : null}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddParticipant({
  conversationId,
  addable,
  onDone,
}: {
  conversationId: string;
  addable: MemberSummary[];
  onDone: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const matches = searchMentionable(
    query,
    addable.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      memberCode: m.memberCode,
    })),
    6,
  );

  async function add(memberId: string) {
    setBusy(true);
    try {
      await fetch(`/api/authority/conversations/${conversationId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 rounded-[14px] border border-line bg-surface p-2.5">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search department members"
        aria-label="Search members to add"
      />
      <ul className="mt-1.5 space-y-0.5">
        {matches.length === 0 ? (
          <li className="px-2 py-1.5 text-[0.8125rem] text-muted">
            No other members of this department to add.
          </li>
        ) : (
          matches.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => add(member.id)}
                className="w-full rounded-[10px] px-2 py-1.5 text-start text-[0.8125rem] hover:bg-civic-50 disabled:opacity-50"
              >
                {member.displayName}{" "}
                <span className="font-mono text-[0.6875rem] text-muted">
                  {member.memberCode}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function NewConversationForm({
  issueCode,
  members,
  onDone,
}: {
  issueCode: string;
  members: MemberSummary[];
  onDone: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [visibility, setVisibility] = React.useState<"department" | "private">(
    "department",
  );
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/authority/issues/${issueCode}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, visibility, participantMemberIds: selected }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? "That didn't work.");
        setBusy(false);
        return;
      }

      setTitle("");
      setSelected([]);
      onDone();
    } catch {
      setError("Network problem. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line bg-canvas/60 p-4">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What is this discussion about?"
        aria-label="Discussion title"
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
          <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {members.map((member) => {
              const on = selected.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() =>
                    setSelected((current) =>
                      on ? current.filter((id) => id !== member.id) : [...current, member.id],
                    )
                  }
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors",
                    on
                      ? "border-civic-600 bg-civic-100 text-civic-900"
                      : "border-line-strong bg-surface text-muted hover:bg-civic-50",
                  )}
                >
                  {member.displayName}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button
          onClick={create}
          loading={busy}
          disabled={title.trim().length < 2}
          className="px-4 text-sm"
        >
          Create discussion
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
