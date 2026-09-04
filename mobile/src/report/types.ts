/*
 * The Stage 2 report contract, mirrored from src/lib/report/schema.ts on the
 * web. Kept in exact sync rather than reimplemented loosely — this ships as a
 * matching pair with the server, the same way registration's validation.ts
 * mirrors the web's registration schema.
 */

export const CIVIC_CATEGORIES = [
  "ROAD_DAMAGE",
  "POTHOLE",
  "GARBAGE",
  "BROKEN_STREETLIGHT",
  "WATER_LEAKAGE",
  "DRAINAGE_PROBLEM",
  "OPEN_MANHOLE",
  "DAMAGED_FOOTPATH",
  "DAMAGED_PUBLIC_INFRASTRUCTURE",
  "OTHER",
] as const;
export type CivicCategory = (typeof CIVIC_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CivicCategory, string> = {
  ROAD_DAMAGE: "Road damage",
  POTHOLE: "Pothole",
  GARBAGE: "Garbage",
  BROKEN_STREETLIGHT: "Broken streetlight",
  WATER_LEAKAGE: "Water leakage",
  DRAINAGE_PROBLEM: "Drainage problem",
  OPEN_MANHOLE: "Open manhole",
  DAMAGED_FOOTPATH: "Damaged footpath",
  DAMAGED_PUBLIC_INFRASTRUCTURE: "Damaged public infrastructure",
  OTHER: "Other civic issue",
};

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type FieldSource = "ai" | "manual";
export type ReportStatus = "draft" | "analyzing" | "ready_for_review" | "ready_for_submission";

export interface VisionResult {
  detected: boolean;
  category: CivicCategory | null;
  confidence: number;
  /** Short, image-grounded observations — never a claim beyond what's visible. */
  evidence: string[];
  /** False when the photo itself is too unclear to say anything reliable. */
  readable: boolean;
}

/** Everything the client needs to render a report, with nothing sensitive it doesn't. */
export interface ReportDto {
  id: string;
  status: ReportStatus;
  hasImage: boolean;
  category: CivicCategory | null;
  categorySource: FieldSource | null;
  visionConfidence: number | null;
  visionEvidence: string[];
  visionConfirmed: boolean;
  transcript: string | null;
  transcriptLanguage: string | null;
  transcriptSource: FieldSource | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyMeters: number | null;
  locationLabel: string | null;
  locationSource: "gps" | "manual" | null;
  title: string | null;
  titleSource: FieldSource | null;
  description: string | null;
  descriptionSource: FieldSource | null;
  severity: Severity | null;
  severitySource: FieldSource | null;
  createdAt: string;
  updatedAt: string;
}
