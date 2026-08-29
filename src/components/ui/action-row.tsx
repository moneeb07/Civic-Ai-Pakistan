import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The tappable row pattern from the reference: a tinted icon tile, a title with
 * optional supporting line, and a chevron. Used for both the prominent action
 * cards and the quieter settings-style lists.
 */

const TONES = {
  green: "bg-civic-100 text-civic-700",
  blue: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-700",
  neutral: "bg-canvas text-muted",
} as const;

export type ActionTone = keyof typeof TONES;

interface ActionRowProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  href?: string;
  tone?: ActionTone;
  /** Dimmed, non-interactive, with a short reason — for not-yet-built features. */
  disabledReason?: string;
  className?: string;
}

export function ActionRow({
  icon: Icon,
  title,
  description,
  href,
  tone = "neutral",
  disabledReason,
  className,
}: ActionRowProps) {
  const interactive = Boolean(href) && !disabledReason;

  const content = (
    <>
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-[14px]",
          TONES[tone],
        )}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold text-ink">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
            {description}
          </span>
        ) : null}
        {disabledReason ? (
          <span className="mt-1 inline-block rounded-full bg-canvas px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
            {disabledReason}
          </span>
        ) : null}
      </span>

      {interactive ? (
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
      ) : null}
    </>
  );

  const shared = cn(
    "flex w-full items-center gap-4 rounded-[18px] border border-line bg-surface p-4 text-start transition-colors",
    interactive && "hover:border-civic-200 hover:bg-civic-50/50",
    disabledReason && "opacity-70",
    className,
  );

  if (interactive && href) {
    return (
      <Link href={href} className={shared}>
        {content}
      </Link>
    );
  }

  return (
    <div className={shared} aria-disabled={disabledReason ? true : undefined}>
      {content}
    </div>
  );
}
