import type { ReactNode } from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const t = getDictionary();

/*
 * Empty, loading and error states.
 *
 * All three exist because the alternative — a blank area, a full-page spinner,
 * a raw stack trace — each tell an officer nothing about what to do next. An
 * empty queue is a normal state that deserves a sentence explaining when it
 * will fill, not an apology.
 */

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed shadow-none">
      <CardBody className="flex flex-col items-center px-6 py-10 text-center">
        {Icon ? (
          <span className="mb-4 flex size-12 items-center justify-center rounded-[16px] bg-canvas">
            <Icon className="size-5 text-muted" aria-hidden="true" />
          </span>
        ) : null}
        <h2 className="text-[1.0625rem] font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">{body}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </CardBody>
    </Card>
  );
}

/**
 * Skeletons shaped like the content they stand in for, never a spinner:
 * a queue that resolves into rows should have looked like rows while loading.
 */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite">
      <span className="sr-only">{t.gov.common.loading}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4"
          aria-hidden="true"
        >
          <span className="size-11 shrink-0 animate-pulse rounded-[14px] bg-canvas" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3.5 w-2/5 animate-pulse rounded-full bg-canvas" />
            <span className="block h-3 w-3/5 animate-pulse rounded-full bg-canvas" />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The error card.
 *
 * Carries a short machine-readable reason in a monospace tag so an officer can
 * quote it to support, and never a stack trace — the same discipline the
 * citizen side's error banners follow.
 */
export function ErrorState({
  message,
  reason,
  onRetry,
}: {
  message?: string;
  reason?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-danger/25 bg-danger-bg shadow-none">
      <CardBody>
        <div className="flex items-start gap-2.5">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.0625rem] font-semibold tracking-tight text-ink">
              {t.gov.common.errorTitle}
            </h2>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink/75">
              {message ?? t.gov.common.errorBody}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-10 items-center rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-civic-50"
                >
                  {t.gov.common.tryAgain}
                </button>
              ) : null}
              {reason ? (
                <code className="rounded-md bg-surface px-2 py-1 font-mono text-[0.6875rem] text-muted">
                  {reason}
                </code>
              ) : null}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** The inline error banner used inside forms, matching the citizen flows' treatment exactly. */
export function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-danger/25 bg-danger-bg px-4 py-3"
    >
      <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-danger" aria-hidden="true" />
      <p className="text-[0.875rem] leading-snug text-ink/80">{message}</p>
    </div>
  );
}
