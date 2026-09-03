import {
  boolean,
  doublePrecision,
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/*
 * Phase 1 schema.
 *
 * `user`, `session`, `account` and `verification` are the entities Better Auth
 * requires. `user_profile` holds CivicAI citizen data and is keyed by `user.id`,
 * which keeps credentials (in `account`) logically separate from identity.
 * `registration_session` is short-lived scratch space so that an abandoned
 * sign-up never leaves a half-built citizen in `user_profile`.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    // Identifies the credential's issuer. For email/password this is the app
    // itself; for a future social provider it is that provider's issuer URL.
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    // Hashed by Better Auth (scrypt). Never a plaintext password.
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/*
 * CivicAI citizen profile.
 *
 * CNIC is never stored in plaintext. Three derived columns serve three needs:
 *   cnic_hash       HMAC-SHA256 — duplicate detection without storing the number.
 *                   HMAC rather than a bare hash because a 13-digit CNIC has only
 *                   ~10^13 possibilities and a plain SHA-256 would be trivially
 *                   brute-forced from a leaked table.
 *   cnic_masked     what the UI displays, e.g. "35202-*******-1".
 *   cnic_encrypted  AES-256-GCM, for a future authorised verification integration.
 *
 * Email lives on `user` (Better Auth owns it) and is deliberately not duplicated.
 */
export const userProfile = pgTable(
  "user_profile",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    // Identity — from the CNIC where the citizen confirmed it, else typed in.
    fullName: text("full_name").notNull(),
    fatherName: text("father_name"),
    cnicHash: text("cnic_hash").notNull().unique(),
    cnicMasked: text("cnic_masked").notNull(),
    cnicEncrypted: text("cnic_encrypted").notNull(),
    dateOfBirth: text("date_of_birth"),
    gender: text("gender"),
    /** "cnic_scan" when extracted and confirmed, "manual" when typed. */
    identitySource: text("identity_source").notNull().default("manual"),

    // Contact — always entered by the citizen, never inferred.
    phone: text("phone").notNull(),

    /*
     * Address the citizen confirmed for reporting purposes. It MAY be
     * pre-filled from the CNIC's Present Address (read off the back) but is
     * never written without the citizen seeing and confirming it — see the
     * Address step. `sector` is an Islamabad-style code; `district` covers
     * every city that addresses by tehsil/district instead.
     */
    houseNumber: text("house_number"),
    city: text("city"),
    district: text("district"),
    sector: text("sector"),
    street: text("street"),
    road: text("road"),
    residentialAddress: text("residential_address"),

    /**
     * The Permanent Address exactly as printed on the CNIC's back, kept as a
     * single reference string — not decomposed, not used for routing. This is
     * a record of what the document says, separate from where the citizen
     * actually receives civic services.
     */
    permanentAddress: text("permanent_address"),

    profileImagePath: text("profile_image_path"),

    preferredLanguage: text("preferred_language").notNull().default("en"),
    assistedMode: boolean("assisted_mode").notNull().default(false),

    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("user_profile_user_id_idx").on(table.userId)],
);

/*
 * Temporary onboarding state, addressed by an httpOnly cookie.
 *
 * Registration spans several screens; writing each step straight to
 * `user_profile` would litter the table with abandoned rows. This holds the
 * work in progress instead and is deleted the moment the account is created.
 * `data` is a JSON blob; the CNIC number inside it is encrypted, and the
 * password is never written here at all.
 */
export const registrationSession = pgTable(
  "registration_session",
  {
    id: text("id").primaryKey(),
    step: text("step").notNull().default("identity"),
    data: text("data").notNull().default("{}"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("registration_session_expires_at_idx").on(table.expiresAt)],
);

/*
 * Stage 2 — a civic complaint draft.
 *
 * Deliberately flat rather than split into a separate "evidence" table: this
 * stage is one photo, one voice/typed description and one location per
 * report, so a join would buy nothing. Every AI-derived field (category,
 * description, severity) carries a matching `*Source` column so the UI can
 * show "AI-generated" and the badge disappears the instant the citizen edits
 * it — the same "a field the citizen touches is theirs now" rule the CNIC
 * flow uses (see identity-flow.tsx).
 *
 * No CNIC, no address-book fields, no password: this table only needs enough
 * to identify the citizen (`user_id`) and describe the problem.
 */
export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** draft -> analyzing -> ready_for_review -> ready_for_submission */
    status: text("status").notNull().default("draft"),

    // -- Vision --------------------------------------------------------------
    imagePath: text("image_path"),
    imageMimeType: text("image_mime_type"),
    category: text("category"),
    categorySource: text("category_source"),
    visionConfidence: doublePrecision("vision_confidence"),
    /** Short, image-grounded phrases the model gave for its own guess — never a fact by itself. */
    visionEvidence: text("vision_evidence"),
    visionConfirmed: boolean("vision_confirmed").notNull().default(false),

    // -- Voice / text description ---------------------------------------------
    /** Exactly what was heard or typed — never translated, never rewritten. */
    transcript: text("transcript"),
    transcriptLanguage: text("transcript_language"),
    transcriptSource: text("transcript_source"),

    // -- Location --------------------------------------------------------------
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationAccuracyMeters: doublePrecision("location_accuracy_meters"),
    locationLabel: text("location_label"),
    locationSource: text("location_source"),

    // -- Generated complaint -----------------------------------------------------
    title: text("title"),
    titleSource: text("title_source"),
    description: text("description"),
    descriptionSource: text("description_source"),
    severity: text("severity"),
    severitySource: text("severity_source"),

    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("report_user_id_idx").on(table.userId),
    index("report_status_idx").on(table.status),
    index("report_created_at_idx").on(table.createdAt),
  ],
);

export const schema = {
  user,
  session,
  account,
  verification,
  userProfile,
  registrationSession,
  report,
};

/*
 * Gov-side imports.
 *
 * A second import statement rather than an edit to the one at the top of this
 * file: ESM hoists all imports regardless of position, so this is equivalent
 * to extending line 1 — but it leaves the citizen side's import block byte
 * for byte untouched, which is the point.
 */
import { check, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ==========================================================================
 * Government portal (gov ticket).
 *
 * Appended below the citizen-side `schema` export on purpose: nothing above
 * this line is edited or reordered, so the citizen-side agent and this one
 * never touch the same lines of this file.
 *
 * These tables are deliberately NOT added to the `schema` object above.
 * That object exists for Better Auth's Drizzle adapter and the relational
 * query API; plain `db.select().from(table)` needs no registration, and
 * drizzle-kit reads every exported pgTable in this file when generating a
 * migration. `govSchema` at the bottom is the gov side's own accessor.
 *
 * Roles are `text` + a CHECK constraint rather than a pgEnum, matching the
 * existing convention here (`report.status`, `userProfile.identitySource`)
 * and avoiding a Postgres enum type that would need its own ALTER TYPE
 * migration every time a role is added.
 * ========================================================================== */

/** A government body a citizen complaint can be routed to, e.g. CDA, WASA, MCI. */
import { civicIssue } from "@/db/gov/collaboration";

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Short public code, e.g. "CDA". Unique so it can be shown instead of a UUID. */
    code: text("code").notNull().unique(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("organization_code_idx").on(table.code)],
);

/**
 * A unit inside an organization that actually resolves complaints.
 *
 * `handlesCategories` holds values from CIVIC_CATEGORIES (src/lib/report/schema.ts).
 * It is validated in Zod at the API boundary rather than by a DB constraint,
 * because the category list belongs to the citizen side and must be free to
 * grow there without a gov-side migration.
 */
export const department = pgTable(
  "department",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    handlesCategories: text("handles_categories").array().notNull().default([]),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("department_org_id_idx").on(table.orgId),
    uniqueIndex("department_org_id_name_key").on(table.orgId, table.name),
  ],
);

/*
 * A government user's authorization record.
 *
 * Kept in its own table rather than as a `role` column on `user` for two
 * reasons: `user` is Better Auth's table and the citizen side reads it
 * constantly, and scope (which org, which dept) has no meaning for a citizen.
 * A `user` row with no `officer` row simply has no government access.
 *
 * The CHECK constraint is what makes the nullable scope columns safe: it is
 * impossible to store a dept_head with no department, or a platform_admin
 * scoped to one organization.
 */
export const officer = pgTable(
  "officer",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    /** platform_admin | org_head | dept_head | member */
    role: text("role").notNull(),
    orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
    deptId: text("dept_id").references(() => department.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("officer_user_id_idx").on(table.userId),
    index("officer_org_id_idx").on(table.orgId),
    index("officer_dept_id_idx").on(table.deptId),
    check(
      "officer_role_scope_check",
      sql`(
        (${table.role} = 'platform_admin' AND ${table.orgId} IS NULL AND ${table.deptId} IS NULL)
        OR (${table.role} = 'org_head' AND ${table.orgId} IS NOT NULL AND ${table.deptId} IS NULL)
        OR (${table.role} IN ('dept_head', 'member') AND ${table.orgId} IS NOT NULL AND ${table.deptId} IS NOT NULL)
      )`,
    ),
  ],
);

/*
 * A pending invitation to join the government portal.
 *
 * There is no public sign-up for officers — an account only exists because
 * someone with authority created an invite for that email. The token is 32
 * random bytes; it is the only credential that lets an invite be accepted,
 * so it is indexed for lookup and unique.
 *
 * The partial unique index on (email) WHERE used_at IS NULL allows an email
 * to be re-invited after a previous invite was consumed, while preventing two
 * live invites racing each other to create two officer rows for one person.
 */
export const officerInvite = pgTable(
  "officer_invite",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
    deptId: text("dept_id").references(() => department.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdByOfficerId: text("created_by_officer_id")
      .notNull()
      .references(() => officer.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("officer_invite_token_idx").on(table.token),
    index("officer_invite_created_by_idx").on(table.createdByOfficerId),
    uniqueIndex("officer_invite_pending_email_key")
      .on(table.email)
      .where(sql`used_at IS NULL`),
  ],
);

/** One resolution workflow per department. The stages themselves live in deptWorkflowStage. */
export const deptWorkflow = pgTable(
  "dept_workflow",
  {
    id: text("id").primaryKey(),
    deptId: text("dept_id")
      .notNull()
      .unique()
      .references(() => department.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedByOfficerId: text("updated_by_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("dept_workflow_dept_id_idx").on(table.deptId)],
);

/*
 * One ordered step in a department's workflow.
 *
 * `requiresPhoto` / `requiresNote` are enforced server-side on advance — a
 * member cannot leave a stage without the evidence the department decided
 * that stage needs. `slaHours` is a soft deadline: the UI flags it red when
 * overdue, and nothing auto-transitions, because a missed deadline is a
 * management signal, not a reason to fake progress.
 */
export const deptWorkflowStage = pgTable(
  "dept_workflow_stage",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => deptWorkflow.id, { onDelete: "cascade" }),
    /** 0-indexed. Position 0 is the intake stage a complaint enters on assignment. */
    position: integer("position").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    requiresPhoto: boolean("requires_photo").notNull().default(false),
    requiresNote: boolean("requires_note").notNull().default(false),
    slaHours: integer("sla_hours"),
    /** Exactly one stage per workflow. Reaching it closes the complaint. */
    isTerminal: boolean("is_terminal").notNull().default(false),
  },
  (table) => [
    index("dept_workflow_stage_workflow_id_idx").on(table.workflowId),
    uniqueIndex("dept_workflow_stage_position_key").on(table.workflowId, table.position),
  ],
);

/*
 * The link between a citizen's confirmed report and the government side.
 *
 * This is the seam. Nothing here writes to `report` — the citizen side owns
 * that table completely. A report becomes government work by gaining a row
 * here, and `reportId` is unique so a complaint can only ever be live in one
 * department at a time.
 *
 * The aiSuggested* columns are prepared but unused: the routing service is a
 * later ticket. They stay null until it exists, and `aiSuggestionSource`
 * follows the citizen side's `*_source` convention — "ai" when a model chose
 * the destination, "manual" the moment a human picks or overrides it.
 */
export const complaintAssignment = pgTable(
  "complaint_assignment",
  {
    id: text("id").primaryKey(),
    /*
     * The unit of government work is the ISSUE, not the individual report.
     *
     * This pointed at `report` before the grouping layer was merged in. With
     * AI grouping, one pothole reported by 24 citizens is one problem, and
     * assigning it per-report would spawn 24 parallel workflows for a single
     * repair — which defeats the grouping entirely. The citizen's report is
     * still reachable, one join further out through `issue_report`.
     */
    issueId: text("issue_id")
      .notNull()
      .unique()
      .references(() => civicIssue.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    deptId: text("dept_id")
      .notNull()
      .references(() => department.id, { onDelete: "cascade" }),
    /** Null until a dept head assigns it and it enters the workflow at position 0. */
    currentStageId: text("current_stage_id").references(() => deptWorkflowStage.id, {
      onDelete: "set null",
    }),
    assignedOfficerId: text("assigned_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),

    aiSuggestedOrgId: text("ai_suggested_org_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    aiSuggestedDeptId: text("ai_suggested_dept_id").references(() => department.id, {
      onDelete: "set null",
    }),
    /** 0-1. doublePrecision to mirror report.visionConfidence rather than introduce a second numeric type. */
    aiConfidence: doublePrecision("ai_confidence"),
    aiReasoning: text("ai_reasoning"),
    aiSuggestionSource: text("ai_suggestion_source").notNull().default("ai"),

    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("complaint_assignment_issue_id_idx").on(table.issueId),
    index("complaint_assignment_dept_id_idx").on(table.deptId),
    index("complaint_assignment_org_id_idx").on(table.orgId),
    index("complaint_assignment_officer_idx").on(table.assignedOfficerId),
  ],
);

/*
 * Chronological log of stage entries — one row per time a complaint enters a
 * stage, never updated in place except to close it out.
 *
 * A reopened complaint gets a NEW row for stage 0 rather than resetting the
 * old one, so the history of how long each pass took survives.
 */
export const complaintStageProgress = pgTable(
  "complaint_stage_progress",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => complaintAssignment.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => deptWorkflowStage.id, { onDelete: "cascade" }),
    enteredAt: timestamp("entered_at")
      .$defaultFn(() => new Date())
      .notNull(),
    completedAt: timestamp("completed_at"),
    completedByOfficerId: text("completed_by_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),
    photoUrl: text("photo_url"),
    note: text("note"),
  },
  (table) => [
    index("complaint_stage_progress_assignment_idx").on(table.assignmentId),
    index("complaint_stage_progress_entered_at_idx").on(table.enteredAt),
  ],
);

/*
 * Append-only audit log for everything the government side does to a
 * complaint. `actorOfficerId` is null for system-generated events.
 *
 * `metadata` is JSON in a text column, the same way report.visionEvidence and
 * registrationSession.data store JSON here — consistency with the existing
 * convention rather than introducing jsonb for one table.
 */
export const complaintEvent = pgTable(
  "complaint_event",
  {
    id: text("id").primaryKey(),
    /*
     * Nullable because not every auditable act is about a complaint: editing a
     * department's workflow changes how every future complaint is handled and
     * must be on the record, but belongs to no single report. Such rows carry
     * `deptId` instead. Exactly one of the two is set.
     */
    reportId: text("report_id").references(() => report.id, { onDelete: "cascade" }),
    deptId: text("dept_id").references(() => department.id, { onDelete: "cascade" }),
    actorOfficerId: text("actor_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("complaint_event_report_id_idx").on(table.reportId),
    index("complaint_event_dept_id_idx").on(table.deptId),
    index("complaint_event_created_at_idx").on(table.createdAt),
    check(
      "complaint_event_subject_check",
      sql`(${table.reportId} IS NOT NULL) <> (${table.deptId} IS NOT NULL)`,
    ),
  ],
);

/** A citizen's optional 1-5 rating of how their complaint was handled. One per report. */
export const complaintRating = pgTable(
  "complaint_rating",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .unique()
      .references(() => report.id, { onDelete: "cascade" }),
    citizenUserId: text("citizen_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    comment: text("comment"),
    ratedAt: timestamp("rated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("complaint_rating_report_id_idx").on(table.reportId),
    check("complaint_rating_stars_check", sql`${table.stars} BETWEEN 1 AND 5`),
  ],
);

/*
 * The handoff back to the citizen — see src/lib/gov/README.md.
 *
 * The gov side cannot add a column to `report` (that table belongs to the
 * citizen side), so resolution is announced by writing a row here instead.
 * The citizen-side app reads this table to render an inbox; nothing in this
 * ticket renders it, because that UI is citizen-side work.
 */
export const citizenNotification = pgTable(
  "citizen_notification",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => report.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Only "resolved" today. A vocabulary, so more kinds can be added without a schema change. */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    index("citizen_notification_report_id_idx").on(table.reportId),
    index("citizen_notification_user_id_idx").on(table.userId),
  ],
);

/** The gov side's own table accessor, so gov code never reaches into `schema` above. */
export const govSchema = {
  organization,
  department,
  officer,
  officerInvite,
  deptWorkflow,
  deptWorkflowStage,
  complaintAssignment,
  complaintStageProgress,
  complaintEvent,
  complaintRating,
  citizenNotification,
};
