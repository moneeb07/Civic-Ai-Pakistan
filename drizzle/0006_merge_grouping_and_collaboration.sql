-- Merge of the government hierarchy with the AI grouping + collaboration layer.
--
-- 1. complaint_assignment moves from `report` to `civic_issue`: with grouping,
--    one problem reported by many citizens is ONE unit of departmental work.
-- 2. The collaboration tables arrive: grouping links, department threads,
--    mentions, the officer inbox, and the officer<->citizen clarification channel.
--> statement-breakpoint
CREATE TABLE "civic_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_code" text NOT NULL,
	"org_id" text,
	"dept_id" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text,
	"latitude" double precision,
	"longitude" double precision,
	"location_label" text,
	"report_count" integer DEFAULT 0 NOT NULL,
	"routing_confidence" double precision,
	"routing_rationale" text,
	"routing_source" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "civic_issue_issue_code_unique" UNIQUE("issue_code")
);
--> statement-breakpoint
CREATE TABLE "clarification_message" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"sender_kind" text NOT NULL,
	"officer_id" text,
	"citizen_user_id" text,
	"body" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarification_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"report_id" text NOT NULL,
	"citizen_user_id" text NOT NULL,
	"opened_by_officer_id" text,
	"dept_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"officer_id" text NOT NULL,
	"added_by_officer_id" text,
	"added_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"title" text NOT NULL,
	"visibility" text DEFAULT 'department' NOT NULL,
	"created_by_officer_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"officer_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_report" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"report_id" text NOT NULL,
	"similarity" double precision,
	"match_status" text DEFAULT 'first_report' NOT NULL,
	"match_rationale" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "issue_report_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "message_mention" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"officer_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "officer_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"officer_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"issue_id" text,
	"issue_code" text,
	"conversation_id" text,
	"actor_officer_id" text,
	"read_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaint_assignment" DROP CONSTRAINT IF EXISTS "complaint_assignment_report_id_report_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "complaint_assignment_report_id_idx";
--> statement-breakpoint
ALTER TABLE "complaint_assignment" DROP CONSTRAINT IF EXISTS "complaint_assignment_report_id_unique";
--> statement-breakpoint
ALTER TABLE "complaint_assignment" DROP COLUMN IF EXISTS "report_id";
--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD COLUMN "issue_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_issue_id_unique" UNIQUE("issue_id");
--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "complaint_assignment_issue_id_idx" ON "complaint_assignment" USING btree ("issue_id");
--> statement-breakpoint
ALTER TABLE "civic_issue" ADD CONSTRAINT "civic_issue_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "civic_issue" ADD CONSTRAINT "civic_issue_dept_id_department_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_message" ADD CONSTRAINT "clarification_message_thread_id_clarification_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."clarification_thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_message" ADD CONSTRAINT "clarification_message_officer_id_officer_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_message" ADD CONSTRAINT "clarification_message_citizen_user_id_user_id_fk" FOREIGN KEY ("citizen_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_thread" ADD CONSTRAINT "clarification_thread_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_thread" ADD CONSTRAINT "clarification_thread_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_thread" ADD CONSTRAINT "clarification_thread_citizen_user_id_user_id_fk" FOREIGN KEY ("citizen_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_thread" ADD CONSTRAINT "clarification_thread_opened_by_officer_id_officer_id_fk" FOREIGN KEY ("opened_by_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clarification_thread" ADD CONSTRAINT "clarification_thread_dept_id_department_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversation_id_issue_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."issue_conversation"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_officer_id_officer_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officer"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_added_by_officer_id_officer_id_fk" FOREIGN KEY ("added_by_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_conversation" ADD CONSTRAINT "issue_conversation_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_conversation" ADD CONSTRAINT "issue_conversation_created_by_officer_id_officer_id_fk" FOREIGN KEY ("created_by_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_message" ADD CONSTRAINT "issue_message_conversation_id_issue_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."issue_conversation"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_message" ADD CONSTRAINT "issue_message_officer_id_officer_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officer"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_report" ADD CONSTRAINT "issue_report_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_report" ADD CONSTRAINT "issue_report_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_message_id_issue_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."issue_message"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_officer_id_officer_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officer"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "officer_notification" ADD CONSTRAINT "officer_notification_officer_id_officer_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officer"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "officer_notification" ADD CONSTRAINT "officer_notification_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "officer_notification" ADD CONSTRAINT "officer_notification_conversation_id_issue_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."issue_conversation"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "officer_notification" ADD CONSTRAINT "officer_notification_actor_officer_id_officer_id_fk" FOREIGN KEY ("actor_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "civic_issue_org_idx" ON "civic_issue" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "civic_issue_dept_idx" ON "civic_issue" USING btree ("dept_id");
--> statement-breakpoint
CREATE INDEX "civic_issue_category_idx" ON "civic_issue" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "clarification_message_thread_idx" ON "clarification_message" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX "clarification_thread_issue_idx" ON "clarification_thread" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX "clarification_thread_citizen_idx" ON "clarification_thread" USING btree ("citizen_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "clarification_thread_report_idx" ON "clarification_thread" USING btree ("report_id");
--> statement-breakpoint
CREATE INDEX "conversation_participant_conversation_idx" ON "conversation_participant" USING btree ("conversation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participant_unique_idx" ON "conversation_participant" USING btree ("conversation_id","officer_id");
--> statement-breakpoint
CREATE INDEX "issue_conversation_issue_idx" ON "issue_conversation" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX "issue_message_conversation_idx" ON "issue_message" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX "issue_report_issue_idx" ON "issue_report" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX "message_mention_message_idx" ON "message_mention" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX "message_mention_officer_idx" ON "message_mention" USING btree ("officer_id");
--> statement-breakpoint
CREATE INDEX "officer_notification_officer_idx" ON "officer_notification" USING btree ("officer_id");
--> statement-breakpoint
CREATE INDEX "officer_notification_unread_idx" ON "officer_notification" USING btree ("officer_id","read_at");
