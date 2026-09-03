/*
 * The civic status lifecycle — the single source of truth.
 *
 * Every badge, every progress tracker, every table cell and every chart legend
 * in the product reads its colour, label and icon from here. Nothing else in
 * the codebase is allowed to decide what "in process" looks like: the moment a
 * second page picks its own amber, the two drift, and a citizen sees one colour
 * on their dashboard and a different one on the issue they opened from it.
 *
 * Colour is never the only signal. Each status carries a label AND an icon
 * name, because roughly one in twelve men has some form of colour-vision
 * deficiency, and red/amber/green is precisely the axis they cannot separate.
 *
 * Pure and framework-free, so the mapping is unit-testable and can be shared
 * with the React Native app, which cannot import anything DOM-shaped.
 */

export const CIVIC_STATUSES = ["REPORTED", "IN_PROCESS", "RESOLVED"] as const;
export type CivicStatus = (typeof CIVIC_STATUSES)[number];

export interface StatusPresentation {
  status: CivicStatus;
  /** Shown to citizens. Sentence case, not shouted. */
  label: string;
  /** What it actually means, for tooltips and screen readers. */
  description: string;
  /** lucide-react icon name — resolved by the component, so this stays pure. */
  icon: "circle-dot" | "loader" | "circle-check";
  /** Tailwind class fragments, all pointing at tokens in globals.css. */
  text: string;
  bg: string;
  border: string;
  /** Solid fill, for beads, dots and chart marks. */
  fill: string;
}

const PRESENTATION: Record<CivicStatus, StatusPresentation> = {
  REPORTED: {
    status: "REPORTED",
    label: "Reported",
    description: "Filed by a citizen. No department has picked it up yet.",
    icon: "circle-dot",
    text: "text-status-reported",
    bg: "bg-status-reported-bg",
    border: "border-status-reported-line",
    fill: "bg-status-reported",
  },
  IN_PROCESS: {
    status: "IN_PROCESS",
    label: "In process",
    description: "Inside a department's workflow and actively being worked on.",
    icon: "loader",
    text: "text-status-process",
    bg: "bg-status-process-bg",
    border: "border-status-process-line",
    fill: "bg-status-process",
  },
  RESOLVED: {
    status: "RESOLVED",
    label: "Resolved",
    description: "Reached the department's final stage and was closed.",
    icon: "circle-check",
    text: "text-status-resolved",
    bg: "bg-status-resolved-bg",
    border: "border-status-resolved-line",
    fill: "bg-status-resolved",
  },
};

export function statusPresentation(status: CivicStatus): StatusPresentation {
  return PRESENTATION[status];
}

export const ALL_STATUS_PRESENTATIONS: StatusPresentation[] = CIVIC_STATUSES.map(
  (status) => PRESENTATION[status],
);

/**
 * Derives the lifecycle status from what the database actually stores.
 *
 * The database does not hold a status column, and deliberately so: each
 * department defines its own ordered workflow stages, so "in process" for the
 * water board ("Valve isolated") is not the same stage as for the roads
 * department ("Inspection scheduled"). Storing a fixed enum alongside those
 * stages would create two sources of truth that drift the first time somebody
 * edits a workflow.
 *
 * So the three-state lifecycle every citizen understands is COMPUTED from the
 * department's own stages, right here, once:
 *
 *   no stage yet   -> REPORTED    (nobody has picked it up)
 *   terminal stage -> RESOLVED    (the department's own definition of done)
 *   anything else  -> IN_PROCESS
 */
export function deriveStatus(input: {
  /** The department stage the issue currently sits on, if assigned. */
  stageName: string | null | undefined;
  /** Whether that stage is the workflow's terminal stage. */
  isResolved: boolean;
}): CivicStatus {
  if (input.isResolved) return "RESOLVED";
  if (!input.stageName) return "REPORTED";
  return "IN_PROCESS";
}

/**
 * Position of a status on the three-step tracker, 0-indexed.
 *
 * Used to decide which beads are filled and which rails are complete, so the
 * tracker cannot disagree with the badge beside it.
 */
export function statusIndex(status: CivicStatus): number {
  return CIVIC_STATUSES.indexOf(status);
}
