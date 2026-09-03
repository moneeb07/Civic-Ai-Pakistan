import { z } from "zod";

import { CIVIC_CATEGORIES, SEVERITIES } from "@/lib/report/schema";

/** Re-exported so gov code never reaches into the citizen side for a type it uses everywhere. */
export type Severity = (typeof SEVERITIES)[number];

/*
 * The government portal's contract, shared by the browser and the server —
 * the same split src/lib/report/schema.ts uses. Every form validates against
 * these client-side for instant feedback, and every route handler re-parses
 * the request body against the same schema before anything is written.
 *
 * Nothing here is imported by citizen-side code, and this file imports only
 * the two frozen vocabularies (categories, severities) from the citizen side
 * rather than redefining them — a category added there must not need a
 * gov-side edit to be routable.
 */

// -- Roles ------------------------------------------------------------------

export const OFFICER_ROLES = ["platform_admin", "org_head", "dept_head", "member"] as const;
export type OfficerRole = (typeof OFFICER_ROLES)[number];

export const officerRoleSchema = z.enum(OFFICER_ROLES);

/** Where each role lands after signing in or accepting an invite. */
export const ROLE_HOME: Record<OfficerRole, string> = {
  platform_admin: "/gov/admin",
  org_head: "/gov/org",
  dept_head: "/gov/dept",
  member: "/gov/work",
};

// -- Audit vocabulary --------------------------------------------------------

export const COMPLAINT_EVENT_TYPES = [
  "invited",
  "accepted_invite",
  "routed_by_ai",
  "org_approved",
  "org_overrode",
  "assigned_to_member",
  "stage_advanced",
  "resolved",
  "citizen_rated",
  "reopened",
  "workflow_updated",
] as const;
export type ComplaintEventType = (typeof COMPLAINT_EVENT_TYPES)[number];

// -- Organizations -----------------------------------------------------------

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /*
   * Uppercase letters and digits only. This code appears in invite emails and
   * in the UI in place of an opaque id, so it must be typeable and unambiguous.
   */
  code: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9]+$/, "Use capital letters and digits only, e.g. CDA."),
});
export type CreateOrganizationValues = z.infer<typeof createOrganizationSchema>;

// -- Departments -------------------------------------------------------------

export const createDepartmentSchema = z.object({
  orgId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(120),
  /** Which citizen-side categories this department handles. May be empty until decided. */
  handlesCategories: z.array(z.enum(CIVIC_CATEGORIES)).max(CIVIC_CATEGORIES.length).default([]),
});
export type CreateDepartmentValues = z.infer<typeof createDepartmentSchema>;

// -- Invites -----------------------------------------------------------------

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: officerRoleSchema,
  orgId: z.string().trim().min(1).nullable().optional(),
  deptId: z.string().trim().min(1).nullable().optional(),
});
export type CreateInviteValues = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });
export type AcceptInviteValues = z.infer<typeof acceptInviteSchema>;

export const govLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});
export type GovLoginValues = z.infer<typeof govLoginSchema>;

/*
 * Which roles a given role may invite, and into what scope.
 *
 * Expressed as data rather than as branching inside the route handler so the
 * rule is testable on its own and there is exactly one place to read it.
 */
export const INVITABLE_ROLES: Record<OfficerRole, readonly OfficerRole[]> = {
  platform_admin: ["platform_admin", "org_head", "dept_head", "member"],
  org_head: ["dept_head"],
  dept_head: ["member"],
  member: [],
};

/** Max invites one officer may create per rolling hour. */
export const INVITE_RATE_LIMIT = 10;
export const INVITE_RATE_WINDOW_MS = 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// -- Workflow ----------------------------------------------------------------

export const workflowStageSchema = z.object({
  /** Present when editing an existing stage; absent for a newly added one. */
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).nullable().optional(),
  requiresPhoto: z.boolean(),
  requiresNote: z.boolean(),
  slaHours: z.number().int().min(1).max(8760).nullable().optional(),
  isTerminal: z.boolean(),
});
export type WorkflowStageValues = z.infer<typeof workflowStageSchema>;

/*
 * The whole workflow is submitted and validated as one list, never stage by
 * stage. Position is the array index — the client reorders by moving items,
 * so sending an explicit position would be a second source of truth that
 * could disagree with the order the dept head actually sees.
 *
 * The three superRefine rules are the same ones the DB and the UI enforce:
 * exactly one terminal stage, at least one non-terminal stage, no duplicate
 * names. They live here so all three layers check the identical thing.
 */
export const workflowSchema = z
  .object({
    stages: z.array(workflowStageSchema).min(2).max(12),
  })
  .superRefine((value, ctx) => {
    const terminals = value.stages.filter((stage) => stage.isTerminal);

    if (terminals.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stages"],
        message: "Choose which stage means the complaint is resolved.",
      });
    } else if (terminals.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stages"],
        message: "Only one stage can be the resolved stage.",
      });
    }

    if (value.stages.length - terminals.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stages"],
        message: "Keep at least one stage before the resolved stage.",
      });
    }

    const seen = new Set<string>();
    value.stages.forEach((stage, index) => {
      const key = stage.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", index, "name"],
          message: "Two stages have the same name.",
        });
      }
      seen.add(key);
    });
  });
export type WorkflowValues = z.infer<typeof workflowSchema>;

/*
 * Seeded for a department that has never defined a workflow, and shown
 * flagged as a template so the dept head reviews it rather than inheriting
 * someone else's process by accident.
 */
export const DEFAULT_WORKFLOW_STAGES: readonly WorkflowStageValues[] = [
  { name: "New", description: null, requiresPhoto: false, requiresNote: false, slaHours: 24, isTerminal: false },
  { name: "In Progress", description: null, requiresPhoto: false, requiresNote: false, slaHours: 72, isTerminal: false },
  { name: "Resolved", description: null, requiresPhoto: true, requiresNote: false, slaHours: null, isTerminal: true },
];

// -- Routing and assignment ---------------------------------------------------

export const routeComplaintSchema = z.object({
  deptId: z.string().trim().min(1),
  /** True when the officer accepted the AI's suggestion unchanged. False (or absent) means they chose it themselves. */
  acceptedAiSuggestion: z.boolean().optional(),
});
export type RouteComplaintValues = z.infer<typeof routeComplaintSchema>;

export const assignComplaintSchema = z.object({
  officerId: z.string().trim().min(1),
});
export type AssignComplaintValues = z.infer<typeof assignComplaintSchema>;

export const advanceStageSchema = z.object({
  photoUrl: z.string().trim().url().max(2000).nullable().optional(),
  note: z.string().trim().min(1).max(1200).nullable().optional(),
});
export type AdvanceStageValues = z.infer<typeof advanceStageSchema>;

export const rateComplaintSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000).nullable().optional(),
});
export type RateComplaintValues = z.infer<typeof rateComplaintSchema>;

/** A rating at or below this flags the complaint on the dept head's dashboard. No automatic reopen. */
export const LOW_RATING_THRESHOLD = 2;

// -- Shapes sent to the browser ------------------------------------------------

export interface OfficerDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OfficerRole;
  orgId: string | null;
  orgName: string | null;
  deptId: string | null;
  deptName: string | null;
}

export interface OrganizationDto {
  id: string;
  name: string;
  code: string;
  departmentCount: number;
  createdAt: string;
}

export interface DepartmentDto {
  id: string;
  orgId: string;
  name: string;
  handlesCategories: string[];
  hasWorkflow: boolean;
  createdAt: string;
}

export interface InviteDto {
  id: string;
  email: string;
  role: OfficerRole;
  orgId: string | null;
  orgName: string | null;
  deptId: string | null;
  deptName: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface WorkflowStageDto {
  id: string;
  position: number;
  name: string;
  description: string | null;
  requiresPhoto: boolean;
  requiresNote: boolean;
  slaHours: number | null;
  isTerminal: boolean;
}

export interface WorkflowDto {
  id: string;
  deptId: string;
  stages: WorkflowStageDto[];
  updatedAt: string;
  /** True when these stages are the seeded default and no one has saved them yet. */
  isTemplate: boolean;
}

/** A citizen complaint as the government side sees it. Read-only — the gov side never writes to `report`. */
export interface ComplaintDto {
  reportId: string;
  title: string | null;
  description: string | null;
  category: string | null;
  severity: Severity | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  submittedAt: string;
  /** Null while the complaint is still unrouted in the organization's inbox. */
  assignment: {
    id: string;
    orgId: string;
    deptId: string;
    deptName: string;
    currentStageId: string | null;
    currentStageName: string | null;
    assignedOfficerId: string | null;
    assignedOfficerName: string | null;
    aiSuggestedDeptId: string | null;
    aiConfidence: number | null;
    aiReasoning: string | null;
    aiSuggestionSource: string;
    isResolved: boolean;
    stageEnteredAt: string | null;
    slaHours: number | null;
  } | null;
  rating: { stars: number; comment: string | null; ratedAt: string } | null;
  needsAttention: boolean;
}

export interface StageProgressDto {
  id: string;
  stageId: string;
  stageName: string;
  enteredAt: string;
  completedAt: string | null;
  completedByOfficerName: string | null;
  photoUrl: string | null;
  note: string | null;
}
