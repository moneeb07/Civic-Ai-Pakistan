import { z } from "zod";

import { CIVIC_CATEGORIES } from "@/lib/report/schema";

/*
 * The Stage 3 contract, shared by browser and server — the same split the
 * citizen side uses. Everything here is about the AUTHORITY half of CivicAI:
 * the issue an authority works on, who may see it, and how they talk about it.
 */

/**
 * The three stages an issue moves through. Deliberately three — this is a
 * civic workflow a citizen and a department member both have to understand at
 * a glance, not a ticketing system.
 */
export const ISSUE_STATUSES = ["REPORTED", "IN_PROCESS", "RESOLVED"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/**
 * Application permissions, and nothing else.
 *
 * There is no seniority model in CivicAI and there must not be one: within a
 * department every member is a peer who can open a discussion, post, and
 * mention anyone. These two values only decide who may administer the
 * authority, never who may speak to whom.
 */
export const ACCESS_TYPES = ["authority_admin", "department_member"] as const;
export type AccessType = (typeof ACCESS_TYPES)[number];

export const CONVERSATION_VISIBILITIES = ["department", "private"] as const;
export type ConversationVisibility = (typeof CONVERSATION_VISIBILITIES)[number];

/**
 * How a report came to be attached to an issue.
 *
 * `needs_review` is the important one: it is what "do not blindly merge"
 * looks like in the data. A plausible-but-uncertain match is grouped
 * provisionally, shown as unconfirmed, and can be split back out.
 */
export const MATCH_STATUSES = [
  "first_report",
  "auto_grouped",
  "needs_review",
  "confirmed",
  "rejected",
  "seed_group",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

// -- Identifiers ------------------------------------------------------------

/**
 * `CIV-CDA-000001` — the public, stable, searchable name of an issue.
 *
 * Built from the authority's own code so an identifier says which body owns
 * the problem, and zero-padded so codes sort lexicographically.
 */
export function formatIssueCode(authorityCode: string, sequence: number): string {
  return `CIV-${authorityCode.toUpperCase()}-${String(sequence).padStart(6, "0")}`;
}

/** `CDA-10482` — a member's identifier. An identifier, never a rank. */
export function formatMemberCode(authorityCode: string, sequence: number): string {
  return `${authorityCode.toUpperCase()}-${10000 + sequence}`;
}

/** Loose enough to accept what a member types into a search box. */
export function normaliseIssueCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export const ISSUE_CODE_PATTERN = /^CIV-[A-Z0-9]{2,10}-\d{6}$/;

export function isValidIssueCode(input: string): boolean {
  return ISSUE_CODE_PATTERN.test(normaliseIssueCode(input));
}

// -- API payloads -----------------------------------------------------------

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, { message: "Please name the department." }).max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  /** Which civic categories route here. An empty list receives nothing. */
  categories: z.array(z.enum(CIVIC_CATEGORIES)).max(CIVIC_CATEGORIES.length),
});
export type CreateDepartmentValues = z.infer<typeof createDepartmentSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(ISSUE_STATUSES),
  note: z.string().trim().max(400).optional().or(z.literal("")),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(2, { message: "Please name the discussion." }).max(80),
  visibility: z.enum(CONVERSATION_VISIBILITIES),
  /*
   * Only meaningful for a private conversation. The creator is always added
   * server-side, so an empty list still yields a usable thread.
   */
  participantMemberIds: z.array(z.string().max(64)).max(50).optional(),
});

export const postMessageSchema = z.object({
  body: z.string().trim().min(1, { message: "Write a message first." }).max(2000),
});

export const addParticipantSchema = z.object({
  memberId: z.string().trim().min(1).max(64),
});

export const inviteMemberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email." }),
  departmentId: z.string().trim().min(1).max(64).nullable().optional(),
  accessType: z.enum(ACCESS_TYPES),
});

// -- Display helpers --------------------------------------------------------

export const STATUS_LABELS: Record<IssueStatus, string> = {
  REPORTED: "Reported",
  IN_PROCESS: "In process",
  RESOLVED: "Resolved",
};

/** The dot colour each status is drawn with, kept in one place. */
export const STATUS_TONE: Record<IssueStatus, "red" | "amber" | "green"> = {
  REPORTED: "red",
  IN_PROCESS: "amber",
  RESOLVED: "green",
};

export const CATEGORY_LABELS: Record<string, string> = {
  ROAD_DAMAGE: "Road damage",
  POTHOLE: "Pothole",
  GARBAGE: "Garbage",
  BROKEN_STREETLIGHT: "Broken streetlight",
  WATER_LEAKAGE: "Water leakage",
  DRAINAGE_PROBLEM: "Drainage problem",
  OPEN_MANHOLE: "Open manhole",
  DAMAGED_FOOTPATH: "Damaged footpath",
  DAMAGED_PUBLIC_INFRASTRUCTURE: "Damaged public infrastructure",
  OTHER: "Other",
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "Uncategorised";
  return CATEGORY_LABELS[category] ?? category;
}
