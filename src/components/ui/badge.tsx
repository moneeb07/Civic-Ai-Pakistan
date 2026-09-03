import * as React from "react";
import { CircleCheck, CircleDot, Loader } from "lucide-react";

import { cn } from "@/lib/utils";
import { statusPresentation, type CivicStatus } from "@/lib/civic/status";

/*
 * Badges.
 *
 * Two components on purpose. `Badge` is the general-purpose chip for counts,
 * categories and departments. `StatusBadge` is specifically the civic
 * lifecycle, and it takes a CivicStatus rather than a colour — so no page can
 * invent its own amber, which is exactly how a design system rots.
 */

type Tone = "neutral" | "brand" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-canvas text-muted border-line",
  brand: "bg-civic-50 text-civic-700 border-civic-200",
  danger: "bg-danger-bg text-danger border-danger/20",
};

function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.75rem] font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const ICONS = {
  "circle-dot": CircleDot,
  loader: Loader,
  "circle-check": CircleCheck,
} as const;

/**
 * The civic lifecycle badge.
 *
 * Always renders an icon alongside the colour and the word. Red/amber/green is
 * the exact axis colour-blind users cannot separate, so colour here is a
 * reinforcement of the label, never the message itself.
 */
function StatusBadge({
  status,
  className,
  showLabel = true,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  status: CivicStatus;
  /** Hide the word on very dense rows — the icon and title still carry it. */
  showLabel?: boolean;
}) {
  const presentation = statusPresentation(status);
  const Icon = ICONS[presentation.icon];

  return (
    <span
      title={presentation.description}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.75rem] font-semibold",
        presentation.bg,
        presentation.text,
        presentation.border,
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {showLabel ? presentation.label : <span className="sr-only">{presentation.label}</span>}
    </span>
  );
}

export { Badge, StatusBadge };
