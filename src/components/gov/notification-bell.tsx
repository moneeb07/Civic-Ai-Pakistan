"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, MessageSquare, UserRoundPlus } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The officer's inbox, as a header control.
 *
 * The point of the mention feature is that nobody has to be told about an
 * issue over WhatsApp — so a mention sitting unread inside a thread nobody has
 * opened would defeat it entirely. Every entry therefore leads somewhere
 * precise: the issue code is shown as the clickable reference, and following
 * it opens the exact conversation the officer was named in, not a dashboard
 * they then have to search.
 */

interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  issueCode: string | null;
  conversationId: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mention: MessageSquare,
  clarification_reply: MessageSquare,
  assigned: UserRoundPlus,
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationDto[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);

  // Polled rather than pushed: there is no realtime channel in this build, and
  // a 60s refresh is honest about that without pretending to be instant.
  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/gov/notifications");
        const payload = await response.json();
        if (cancelled || !payload.success) return;
        setItems(payload.data.items);
        setUnread(payload.data.unread);
      } catch {
        // A failed poll leaves the previous count on screen, which is better
        // than flashing "0 unread" at somebody who has unread messages.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function openNotification(item: NotificationDto) {
    setOpen(false);

    if (!item.readAt) {
      setUnread((n) => Math.max(0, n - 1));
      setItems((list) =>
        list.map((row) =>
          row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row,
        ),
      );
      // Best-effort: a failed read-marking must never block navigation.
      void fetch(`/api/gov/notifications/${item.id}/read`, { method: "POST" });
    }

    if (item.issueCode) {
      const target = item.conversationId
        ? `/gov/issues/${item.issueCode}?thread=${item.conversationId}`
        : `/gov/issues/${item.issueCode}`;
      router.push(target);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute end-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Click-away layer, so the panel closes like every other menu. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />

          <div className="absolute end-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[16px] border border-line bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-[0.8125rem] font-semibold text-ink">Notifications</span>
              <Link
                href="/gov/notifications"
                onClick={() => setOpen(false)}
                className="text-[0.75rem] font-medium text-civic-700 hover:underline"
              >
                See all
              </Link>
            </div>

            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {!loaded ? (
                <li className="px-4 py-6 text-center text-[0.8125rem] text-muted">Loading…</li>
              ) : items.length === 0 ? (
                <li className="px-4 py-8 text-center text-[0.8125rem] text-muted">
                  Nothing yet. You&rsquo;ll be notified here when a colleague mentions you.
                </li>
              ) : (
                items.slice(0, 8).map((item) => {
                  const Icon = ICONS[item.kind] ?? MessageSquare;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(item)}
                        className={cn(
                          "flex w-full gap-2.5 px-4 py-3 text-start transition-colors hover:bg-canvas",
                          !item.readAt && "bg-civic-50/60",
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-civic-700" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-semibold text-ink">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.75rem] text-muted">
                            {item.body}
                          </span>
                          {item.issueCode ? (
                            <span className="mt-1 inline-block font-mono text-[0.6875rem] font-bold text-civic-700">
                              {item.issueCode}
                            </span>
                          ) : null}
                        </span>
                        {!item.readAt ? (
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-civic-600"
                            aria-label="Unread"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
