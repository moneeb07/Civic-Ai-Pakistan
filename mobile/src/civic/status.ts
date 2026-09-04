/*
 * The civic status lifecycle — mirrored from src/lib/civic/status.ts.
 *
 * That file was written to be shareable with this app ("pure and
 * framework-free... can be shared with the React Native app"), and the RULES
 * here are copied from it verbatim. What could not come across is its
 * presentation half: the web stores Tailwind class fragments, which mean
 * nothing to React Native, so the same tokens are resolved to the literal hex
 * values those classes point at in globals.css. If either side's palette
 * changes, both must — they are one design system.
 *
 * Colour is never the only signal: every status carries a label AND an icon,
 * because red/amber/green is precisely the axis colour-blind users cannot
 * separate.
 */

export const CIVIC_STATUSES = ["REPORTED", "IN_PROCESS", "RESOLVED"] as const;
export type CivicStatus = (typeof CIVIC_STATUSES)[number];

export interface StatusPresentation {
  status: CivicStatus;
  /** Shown to citizens. Sentence case, not shouted. */
  label: string;
  /** What it actually means, for screen readers. */
  description: string;
  /** Ionicons name — the RN equivalent of the web's lucide icon name. */
  icon: "ellipse" | "ellipse-outline" | "checkmark-circle";
  /** Resolved from --color-status-* in src/app/globals.css. */
  color: string;
  bg: string;
  line: string;
}

const PRESENTATION: Record<CivicStatus, StatusPresentation> = {
  REPORTED: {
    status: "REPORTED",
    label: "Reported",
    description: "Filed by a citizen. No department has picked it up yet.",
    icon: "ellipse",
    color: "#a81d33",
    bg: "#fdf1f3",
    line: "#f2d3d9",
  },
  IN_PROCESS: {
    status: "IN_PROCESS",
    label: "In process",
    description: "Inside a department's workflow and actively being worked on.",
    icon: "ellipse-outline",
    color: "#c2790a",
    bg: "#fdf6ea",
    line: "#f0dcb8",
  },
  RESOLVED: {
    status: "RESOLVED",
    label: "Resolved",
    description: "Reached the department's final stage and was closed.",
    icon: "checkmark-circle",
    color: "#0b8f6a",
    bg: "#eefaf5",
    line: "#bfe9d9",
  },
};

export function statusPresentation(status: CivicStatus): StatusPresentation {
  return PRESENTATION[status];
}

/**
 * Derives the lifecycle status from what the database actually stores.
 *
 * There is no status column, deliberately: each department defines its own
 * ordered workflow stages, so "in process" for the water board ("Valve
 * isolated") is a different stage from the roads department's ("Inspection
 * scheduled"). The three-state lifecycle every citizen understands is
 * COMPUTED from those stages, identically on both clients.
 */
export function deriveStatus(input: {
  stageName: string | null | undefined;
  isResolved: boolean;
}): CivicStatus {
  if (input.isResolved) return "RESOLVED";
  if (!input.stageName) return "REPORTED";
  return "IN_PROCESS";
}

/** Position on the three-step tracker, 0-indexed. */
export function statusIndex(status: CivicStatus): number {
  return CIVIC_STATUSES.indexOf(status);
}
