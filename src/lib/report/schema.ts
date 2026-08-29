import { z } from "zod";

/*
 * The Stage 2 report contract, shared by the browser and the server — the
 * same split registration/schema.ts uses: every step validates client-side
 * for instant feedback and is re-validated server-side before anything is
 * written.
 */

export const REPORT_STATUSES = [
  "draft",
  "analyzing",
  "ready_for_review",
  "ready_for_submission",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/*
 * Deliberately short. The brief is explicit: "do not create dozens of
 * unsupported classes" — this list is what the vision prompt is actually
 * asked to recognise, and every category the UI can show.
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

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Every AI-derived field carries where it came from, so the UI can badge it — and stop badging it the moment the citizen edits it. */
export const FIELD_SOURCES = ["ai", "manual"] as const;
export type FieldSource = (typeof FIELD_SOURCES)[number];

// -- Vision -------------------------------------------------------------

export const visionResultSchema = z.object({
  detected: z.boolean(),
  category: z.enum(CIVIC_CATEGORIES).nullable(),
  confidence: z.number().min(0).max(1),
  /** Short, image-grounded observations ("road surface depression") — never a claim beyond what's visible. */
  evidence: z.array(z.string().max(160)).max(5),
  /** False when the photo itself is too unclear to say anything reliable. */
  readable: z.boolean(),
});
export type VisionResult = z.infer<typeof visionResultSchema>;

// -- Speech-to-text -------------------------------------------------------

export const transcriptionResultSchema = z.object({
  /** Exactly what was said, in its original language/script. Null if nothing intelligible was heard. */
  transcript: z.string().max(2000).nullable(),
  /** Best-effort language name ("Urdu", "English") — informational, not used to alter the transcript. */
  language: z.string().max(40).nullable(),
  confident: z.boolean(),
});
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

// -- Reverse geocoding ----------------------------------------------------

export interface ReverseGeocodeResult {
  formattedAddress: string | null;
  city: string | null;
  area: string | null;
}

// -- Complaint generation ---------------------------------------------------

export const generatedComplaintSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1200),
  severity: z.enum(SEVERITIES),
});
export type GeneratedComplaint = z.infer<typeof generatedComplaintSchema>;

// -- API payloads -----------------------------------------------------------

export const locationPayloadSchema = z.union([
  z.object({
    mode: z.literal("gps"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(100_000).nullable().optional(),
  }),
  z.object({
    mode: z.literal("manual"),
    label: z.string().trim().min(1).max(200),
  }),
]);
export type LocationPayload = z.infer<typeof locationPayloadSchema>;

export const describeTextPayloadSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const reportPatchSchema = z.object({
  category: z.enum(CIVIC_CATEGORIES).optional(),
  /** Set true by "Yes, that's the problem"; the category itself may still change later via `category`. */
  visionConfirmed: z.boolean().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(1200).optional(),
  severity: z.enum(SEVERITIES).optional(),
  locationLabel: z.string().trim().min(1).max(200).optional(),
});
export type ReportPatchValues = z.infer<typeof reportPatchSchema>;

// -- The shape sent to the browser -------------------------------------------

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
