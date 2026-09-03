import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { department, officer, organization, report, user } from "@/db/schema";

/*
 * The collaboration layer: AI issue grouping, department discussion, mentions,
 * the officer inbox, and the officer↔citizen clarification channel.
 *
 * This sits between two models that were built independently and then merged:
 *
 *   organization → department → officer      (the government hierarchy)
 *   many reports → one civic_issue           (the AI grouping layer)
 *
 * The join between them is `complaint_assignment`, which now points at a
 * civic_issue rather than a report. That is the whole reason this file exists
 * as a separate unit: grouping changes WHAT a department works on, and every
 * table here follows from that one decision.
 *
 * The governing rule of the merge: the hierarchy decides who may ADMINISTER
 * (create departments, invite people, define workflow, assign work), and it
 * decides nothing at all about who may TALK. Inside a department every officer
 * is a peer — a `member` and a `dept_head` have identical rights in a thread.
 */

/* ==========================================================================
 * Issue grouping
 * ======================================================================== */

/**
 * The underlying real-world problem, distinct from the reports about it.
 *
 * Three citizens reporting one pothole produce three `report` rows and ONE
 * civic_issue. Reports are never merged, rewritten or deleted — they are
 * LINKED here through `issue_report`, so each citizen's own submission
 * survives intact while the department sees a single unit of work.
 *
 * Scoped to org + dept rather than to its own authority table: the government
 * hierarchy already models exactly that, and duplicating it would give the
 * platform two competing ideas of who owns a problem.
 */
export const civicIssue = pgTable(
  "civic_issue",
  {
    id: text("id").primaryKey(),
    /** Stable, searchable public identifier: "CIV-CDA-000001". */
    issueCode: text("issue_code").notNull().unique(),

    orgId: text("org_id").references(() => organization.id, { onDelete: "set null" }),
    /** Null while unrouted — visible to admins, owned by no department yet. */
    deptId: text("dept_id").references(() => department.id, { onDelete: "set null" }),

    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    severity: text("severity"),

    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationLabel: text("location_label"),

    /** Denormalised from issue_report — every list and card shows it. */
    reportCount: integer("report_count").notNull().default(0),

    /*
     * Why the routing agent chose this department. Kept so an officer can see
     * the reasoning rather than being asked to trust an unexplained decision,
     * and so a wrong route can be argued with.
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
    index("civic_issue_org_idx").on(table.orgId),
    index("civic_issue_dept_idx").on(table.deptId),
    index("civic_issue_category_idx").on(table.category),
  ],
);

/**
 * Links one citizen report to the issue it is about.
 *
 * `matchStatus` is what keeps uncertain grouping honest:
 *
 *   first_report  — this report opened the issue
 *   auto_grouped  — the similarity agent was confident enough to group it
 *   needs_review  — plausible but not certain: grouped provisionally, shown as
 *                   unconfirmed, and splittable back out by an officer
 *   confirmed     — an officer agreed with the grouping
 *   seed_group    — created by the demo seed
 *
 * Nothing is ever silently merged: anything below the confidence bar lands in
 * `needs_review` and says so on the issue page.
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
    matchRationale: text("match_rationale"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("issue_report_issue_idx").on(table.issueId)],
);

/* ==========================================================================
 * Department discussion
 * ======================================================================== */

/**
 * A thread of discussion on an issue.
 *
 *   department — every officer in the issue's department may read and post
 *   private    — only the rows in `conversation_participant` may
 *
 * Any officer can open one. There is deliberately no rank gate: the entire
 * point of this feature is that coordinating on a civic problem should not
 * require a separate email or WhatsApp thread, and a permission check on
 * "may I start a conversation" would reintroduce exactly that friction.
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
    createdByOfficerId: text("created_by_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("issue_conversation_issue_idx").on(table.issueId)],
);

/**
 * Who may see a private conversation.
 *
 * There is deliberately no "joined at" cursor: an officer added later reads
 * the ENTIRE history. Someone brought into a discussion needs the context that
 * came before them — that is precisely why they were added — and hiding it
 * would make them useless to the conversation they just joined.
 */
export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => issueConversation.id, { onDelete: "cascade" }),
    officerId: text("officer_id")
      .notNull()
      .references(() => officer.id, { onDelete: "cascade" }),
    addedByOfficerId: text("added_by_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("conversation_participant_conversation_idx").on(table.conversationId),
    uniqueIndex("conversation_participant_unique_idx").on(
      table.conversationId,
      table.officerId,
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
    officerId: text("officer_id")
      .notNull()
      .references(() => officer.id, { onDelete: "cascade" }),
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
 * Stored as rows rather than re-parsed from the message body at read time, so
 * a mention always points at an officer who really is in the department. A
 * message cannot conjure a mention of someone who was never there, and the
 * endpoint cannot be used to probe which officers exist elsewhere.
 */
export const messageMention = pgTable(
  "message_mention",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => issueMessage.id, { onDelete: "cascade" }),
    officerId: text("officer_id")
      .notNull()
      .references(() => officer.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("message_mention_message_idx").on(table.messageId),
    index("message_mention_officer_idx").on(table.officerId),
  ],
);

/* ==========================================================================
 * Officer inbox
 * ======================================================================== */

/**
 * An officer's notification inbox.
 *
 * The point of the mention feature is that nobody has to be told about an
 * issue over WhatsApp — so a mention that only exists inside a thread nobody
 * has opened yet would defeat it. Every row therefore carries enough to jump
 * straight to the exact conversation: the issue's public code for display, and
 * the conversation id for the deep link.
 *
 * `kind` is a vocabulary rather than a boolean so assignment and stage-change
 * notices can be added later without a migration.
 */
export const officerNotification = pgTable(
  "officer_notification",
  {
    id: text("id").primaryKey(),
    officerId: text("officer_id")
      .notNull()
      .references(() => officer.id, { onDelete: "cascade" }),

    /** "mention" | "assigned" | "clarification_reply" */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),

    /** Shown as the clickable reference, e.g. "CIV-CDA-000006". */
    issueId: text("issue_id").references(() => civicIssue.id, { onDelete: "cascade" }),
    issueCode: text("issue_code"),
    /** Deep-link target: opens this exact thread, not just the issue. */
    conversationId: text("conversation_id").references(() => issueConversation.id, {
      onDelete: "cascade",
    }),
    /** The officer whose action caused this, for "Ali mentioned you". */
    actorOfficerId: text("actor_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),

    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("officer_notification_officer_idx").on(table.officerId),
    index("officer_notification_unread_idx").on(table.officerId, table.readAt),
  ],
);

/* ==========================================================================
 * Officer ↔ citizen clarification
 * ======================================================================== */

/**
 * A private question-and-answer channel between the department and ONE citizen.
 *
 * An issue groups many reports from many citizens, so "ask the reporter" has
 * to name which reporter: the thread is keyed to a specific `report`, and the
 * citizen it belongs to. An officer handling a blocked case can ask that
 * person directly — "which side of the street?", "is it still there?" — rather
 * than guessing or closing the case for want of one detail.
 *
 * Strictly separate from `issue_conversation`. The citizen must never see the
 * department's internal discussion, and keeping the two in different tables
 * makes that a structural guarantee rather than a WHERE clause somebody has to
 * remember to write.
 */
export const clarificationThread = pgTable(
  "clarification_thread",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => civicIssue.id, { onDelete: "cascade" }),
    /** Which of the grouped reports — and therefore which citizen — was asked. */
    reportId: text("report_id")
      .notNull()
      .references(() => report.id, { onDelete: "cascade" }),
    citizenUserId: text("citizen_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The officer who opened it; the department keeps the thread if they move on. */
    openedByOfficerId: text("opened_by_officer_id").references(() => officer.id, {
      onDelete: "set null",
    }),
    deptId: text("dept_id").references(() => department.id, { onDelete: "set null" }),

    /** "open" | "closed" — closed when the officer has what they needed. */
    status: text("status").notNull().default("open"),

    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("clarification_thread_issue_idx").on(table.issueId),
    index("clarification_thread_citizen_idx").on(table.citizenUserId),
    uniqueIndex("clarification_thread_report_idx").on(table.reportId),
  ],
);

/**
 * One message in a clarification thread, from either side.
 *
 * `senderKind` rather than two nullable author columns, so a reader never has
 * to infer who spoke from which foreign key happens to be populated. Exactly
 * one of `officerId` / `citizenUserId` is set, matching `senderKind`.
 */
export const clarificationMessage = pgTable(
  "clarification_message",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => clarificationThread.id, { onDelete: "cascade" }),

    /** "officer" | "citizen" */
    senderKind: text("sender_kind").notNull(),
    officerId: text("officer_id").references(() => officer.id, { onDelete: "set null" }),
    citizenUserId: text("citizen_user_id").references(() => user.id, {
      onDelete: "set null",
    }),

    body: text("body").notNull(),
    /** Null until the other side has seen it — drives both inboxes' badges. */
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("clarification_message_thread_idx").on(table.threadId)],
);

/**
 * Exported separately from `schema` (Better Auth's adapter) and from
 * `govSchema` (the hierarchy), so each layer stays independently reviewable.
 */
export const collabSchema = {
  civicIssue,
  issueReport,
  issueConversation,
  conversationParticipant,
  issueMessage,
  messageMention,
  officerNotification,
  clarificationThread,
  clarificationMessage,
};
