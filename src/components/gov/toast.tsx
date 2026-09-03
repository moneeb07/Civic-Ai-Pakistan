"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * A minimal toast, deliberately in components/gov/ rather than components/ui/.
 *
 * The ticket allows adding one to the shared ui/ folder after flagging it, but
 * that folder is the one piece of UI both agents import. Putting it here keeps
 * the citizen side's file list untouched; if the citizen agent ever needs
 * toasts too, this moves up to ui/ as a two-line import change and one
 * coordinated decision, which is cheaper than an unasked-for edit to a shared
 * directory now.
 *
 * No dependency added: composed from a div, the existing Lucide icons and the
 * project's own tokens.
 */

type ToastTone = "success" | "error";

interface ToastMessage {
  id: number;
  tone: ToastTone;
  text: string;
}

interface ToastContextValue {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** Toasts auto-dismiss; errors linger longer because they usually need reading twice. */
const DISMISS_MS: Record<ToastTone, number> = { success: 4000, error: 7000 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const push = React.useCallback(
    (tone: ToastTone, text: string) => {
      const id = nextId.current++;
      setMessages((current) => [...current, { id, tone, text }]);
      // Timer is cleared implicitly: dismissing an already-removed id is a no-op.
      setTimeout(() => dismiss(id), DISMISS_MS[tone]);
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      success: (text: string) => push("success", text),
      error: (text: string) => push("error", text),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        aria-live="polite" rather than "assertive": a toast confirms something
        the officer just did, so it should not interrupt what a screen reader
        is already saying.
      */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            role={message.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-[18px] border px-4 py-3 shadow-[var(--shadow-card)]",
              message.tone === "success"
                ? "border-civic-200 bg-surface"
                : "border-danger/25 bg-danger-bg",
            )}
          >
            {message.tone === "success" ? (
              <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-civic-600" aria-hidden="true" />
            ) : (
              <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-danger" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1 text-[0.875rem] leading-snug text-ink/85">{message.text}</p>
            <button
              type="button"
              onClick={() => dismiss(message.id)}
              aria-label="Dismiss"
              className="-me-1 -mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns a no-op outside a provider rather than throwing.
 *
 * A missing toast is a cosmetic gap; crashing a whole officer page because a
 * confirmation could not be shown would turn it into an outage.
 */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  return context ?? NOOP_TOAST;
}

const NOOP_TOAST: ToastContextValue = { success: () => {}, error: () => {} };
