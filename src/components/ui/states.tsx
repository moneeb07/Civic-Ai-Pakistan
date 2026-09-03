import * as React from "react";
import { CircleAlert, Inbox, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/*
 * The three states every data surface has besides "here is your data", built
 * once so they cannot drift into three different-looking treatments.
 *
 * The rule they share: never a bare spinner and never a bare "no data". An
 * empty list says what would appear here and how to make it appear; an error
 * says what failed and offers the retry. A person who hits one of these is
 * already having a worse time than a person who hit the happy path.
 */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-canvas">
        <Icon className="size-5 text-muted" aria-hidden="true" />
      </span>
      <p className="mt-3 text-[0.9375rem] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-[46ch] text-[0.875rem] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "That didn't load",
  body,
  onRetry,
  className,
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-card)] border border-danger/20 bg-danger-bg px-4 py-3.5",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-semibold text-danger">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-danger/85">{body}</p>
        {onRetry ? (
          <Button
            variant="secondary"
            onClick={onRetry}
            className="mt-3 min-h-10 px-4 text-[0.8125rem]"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Skeleton block.
 *
 * Shaped like the content it replaces rather than a generic grey bar, so the
 * layout does not jump when the real thing arrives — the jump is what makes a
 * fast page feel slow.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-line", className)}
      {...props}
    />
  );
}

export function LoadingState({
  label = "Loading",
  rows = 3,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2.5 h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
