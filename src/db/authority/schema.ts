import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { report, user } from "@/db/schema";

/*
 * Stage 3 — the receiver side of CivicAI.
 *
 * Kept in its own file, with its own migrations and its own `authoritySchema`
 * export, so that Stage 1/2 work and Stage 3 work can be merged independently:
 * nothing here edits src/db/schema.ts, which stays exactly as the citizen-side
 * branches left it. The only coupling is two foreign keys — `user` (a member is
 * a real authenticated account, never a second identity system) and `report`
 * (an issue points at the citizen reports it was raised from).
 *
 * The central idea, and the reason `civic_issue` exists at all: a REPORT is
 * one citizen's account of something; an ISSUE is the real-world problem
 * itself. Three people reporting the same pothole are three reports and one
 * issue. Reports are never merged, rewritten or deleted — every citizen's
 * submission survives intact — they are LINKED to an issue via `issue_report`.
 */

/**
 * A government body that receives reports (CDA, a municipal corporation, a
 * cantonment board). Nothing about CDA is hardcoded anywhere in the system; it
 * is simply the authority the demo seed happens to create.
 */
export const authority = pgTable("authority", {
  id: text("id").primaryKey(),
  /** Short code used inside issue and member identifiers, e.g. "CDA". */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  city: text("city"),

  /*
   * Monotonic counters behind issue and member codes. Held on the row so they
   * can be incremented atomically in a single UPDATE ... RETURNING, which is
   * what stops two concurrent reports being handed the same code. A
   * COUNT(*) + 1 would race.
   */
  issueSequence: integer("issue_sequence").notNull().default(0),
  memberSequence: integer("member_sequence").notNull().default(0),

  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

/**
 * A section within an authority — Water Management, Road & Infrastructure.
 *
 * `categories` is the routing table: the civic categories this department
 * handles, as a JSON array of CivicCategory. The routing agent reads this
 * rather than any hardcoded mapping, so an admin creating a department
 * immediately changes where new reports go.
 */
export const department = pgTable(
  "department",
  {
    id: text("id").primaryKey(),
    authorityId: text("authority_id")
      .notNull()
      .references(() => authority.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /** JSON array of CivicCategory — the routing agent's source of truth. */
    categories: text("categories").notNull().default("[]"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("department_authority_id_idx").on(table.authorityId),
    uniqueIndex("department_authority_slug_idx").on(table.authorityId, table.slug),
  ],
);

/**
 * A person's membership of an authority, and optionally of one department.
 *
 * Deliberately NOT a rank system. `accessType` has exactly two values and both
 * describe application permissions, nothing about seniority:
 *
 *   authority_admin    — manages departments and members, sees every issue
 *   department_member  — works the issues of the departments they belong to
 *
 * Within a department all members are peers: anyone can open a discussion,
 * message anyone, and mention anyone. A user with access to two departments
 * simply has two rows. An admin's row has a null `departmentId`.
 */
export const authorityMember = pgTable(
  "authority_member",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    authorityId: text("authority_id")
      .notNull()
      .references(() => authority.id, { onDelete: "cascade" }),
    /** Null for an authority admin, who is not scoped to one department. */
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "cascade",
    }),
    /** Human-facing identifier, e.g. "CDA-10482". An identifier, not a rank. */
    memberCode: text("member_code").notNull().unique(),
    /** "authority_admin" | "department_member" */
    accessType: text("access_type").notNull().default("department_member"),
    displayName: text("display_name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("authority_member_user_id_idx").on(table.userId),
    index("authority_member_department_id_idx").on(table.departmentId),
  ],
);

/**
 * The underlying real-world problem, distinct from the reports about it.
 *
 * `reportCount` is denormalised from `issue_report` because every dashboard,
 * list and card shows it; it is maintained wherever a link is written.
 */
export const civicIssue = pgTable(
  "civic_issue",
  {
    id: text("id").primaryKey(),
    /** Stable, unique, searchable public identifier: "CIV-CDA-000001". */
    issueCode: text("issue_code").notNull().unique(),
    authorityId: text("authority_id")
      .notNull()
      .references(() => authority.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),

    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    severity: text("severity"),

    /** REPORTED | IN_PROCESS | RESOLVED */
    status: text("status").notNull().default("REPORTED"),

    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationLabel: text("location_label"),

    /** How many citizen reports are grouped here. Denormalised for listings. */
    reportCount: integer("report_count").notNull().default(0),

    /*
     * Why the routing agent chose this department, kept so a member can see
     * the reasoning instead of being asked to trust an unexplained decision.
     */
    routingConfidence: doublePrecision("routing_confidence"),
    routingRationale: text("routing_rationale"),
    routingSource: text("routing_source"),

    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("civic_issue_authority_idx").on(table.authorityId),
    index("civic_issue_department_idx").on(table.departmentId),
    index("civic_issue_status_idx").on(table.status),
    index("civic_issue_category_idx").on(table.category),
  ],
);

/**
 * Links one citizen report to the issue it is about.
 *
 * A report belongs to at most one issue (`reportId` is unique), and the link
 * records HOW it got there. `matchStatus` is what keeps uncertain grouping
 * honest:
 *
 *   first_report  — this report opened the issue
 *   auto_grouped  — the similarity agent was confident enough to group it
 *   needs_review  — plausible but not certain: grouped provisionally, shown as
 *                   unconfirmed, and splittable back out by a member
 *   confirmed     — a member agreed with the grouping
 *   rejected      — a member split it back out
 *   seed_group    — created by the demo seed
 *
 * Nothing is ever silently merged: anything below the confidence bar lands in
 * `needs_review` and says so on the issue workspace.
 */
export const issueReport = pgTable(
  "issue_report",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => civicIssue.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .unique()
      .references(() => report.id, { onDelete: "cascade" }),

    similarity: doublePrecision("similarity"),
    matchStatus: text("match_status").notNull().default("first_report"),
    /** Plain-language account of why these were considered the same problem. */
    matchRationale: text("match_rationale"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("issue_report_issue_idx").on(table.issueId)],
);

/** Every status change, with who and when. Rows are appended, never rewritten. */
export const issueStatusEvent = pgTable(
  "issue_status_event",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => civicIssue.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    /** Null for events the system recorded itself, such as issue creation. */
    memberId: text("member_id").references(() => authorityMember.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("issue_status_event_issue_idx").on(table.issueId)],
);

/**
 * A thread of discussion on an issue.
 *
 * `visibility` is the access rule:
 *   department — every member of the issue's department may read and post
 *   private    — only the rows in `conversation_participant` may
 */
export const issueConversation = pgTable(
  "issue_conversation",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => civicIssue.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** "department" | "private" */
    visibility: text("visibility").notNull().default("department"),
    createdByMemberId: text("created_by_member_id").references(
      () => authorityMember.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("issue_conversation_issue_idx").on(table.issueId)],
);

/**
 * Who may see a private conversation.
 *
 * There is deliberately no "joined at" cursor here, and that is a design
 * decision rather than an omission: a participant added later can read the
 * entire history. Someone brought into a discussion needs the context that
 * came before them, and hiding it would make them useless to the very
 * conversation they were just added to.
 */
export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => issueConversation.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => authorityMember.id, { onDelete: "cascade" }),
    addedByMemberId: text("added_by_member_id").references(
      () => authorityMember.id,
      { onDelete: "set null" },
    ),
    addedAt: timestamp("added_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("conversation_participant_conversation_idx").on(table.conversationId),
    uniqueIndex("conversation_participant_unique_idx").on(
      table.conversationId,
      table.memberId,
    ),
  ],
);

export const issueMessage = pgTable(
  "issue_message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => issueConversation.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => authorityMember.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("issue_message_conversation_idx").on(table.conversationId)],
);

/**
 * Resolved @mentions.
 *
 * Stored as rows rather than re-parsed out of the message body at read time,
 * so a mention always points at a member who really is in an authorised
 * department — a message cannot conjure a mention of someone who was never
 * there, and cannot be used to probe for members outside the department.
 */
export const messageMention = pgTable(
  "message_mention",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => issueMessage.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => authorityMember.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("message_mention_message_idx").on(table.messageId),
    index("message_mention_member_idx").on(table.memberId),
  ],
);

/**
 * Stage 3's tables, exported separately from the citizen-side `schema`.
 *
 * Drizzle only needs a registered schema for its relational query API; all the
 * Stage 3 code uses core select/insert against these table objects, so nothing
 * has to be added to src/db/index.ts either.
 */
export const authoritySchema = {
  authority,
  department,
  authorityMember,
  civicIssue,
  issueReport,
  issueStatusEvent,
  issueConversation,
  conversationParticipant,
  issueMessage,
  messageMention,
};
