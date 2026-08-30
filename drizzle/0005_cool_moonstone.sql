CREATE TABLE "authority" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"city" text,
	"issue_sequence" integer DEFAULT 0 NOT NULL,
	"member_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "authority_code_unique" UNIQUE("code"),
	CONSTRAINT "authority_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "authority_member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"authority_id" text NOT NULL,
	"department_id" text,
	"member_code" text NOT NULL,
	"access_type" text DEFAULT 'department_member' NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "authority_member_member_code_unique" UNIQUE("member_code")
);
--> statement-breakpoint
CREATE TABLE "civic_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_code" text NOT NULL,
	"authority_id" text NOT NULL,
	"department_id" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text,
	"status" text DEFAULT 'REPORTED' NOT NULL,
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
CREATE TABLE "conversation_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"member_id" text NOT NULL,
	"added_by_member_id" text,
	"added_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department" (
	"id" text PRIMARY KEY NOT NULL,
	"authority_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"categories" text DEFAULT '[]' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"title" text NOT NULL,
	"visibility" text DEFAULT 'department' NOT NULL,
	"created_by_member_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"member_id" text NOT NULL,
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
CREATE TABLE "issue_status_event" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"member_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_mention" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"member_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authority_member" ADD CONSTRAINT "authority_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authority_member" ADD CONSTRAINT "authority_member_authority_id_authority_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."authority"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authority_member" ADD CONSTRAINT "authority_member_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "civic_issue" ADD CONSTRAINT "civic_issue_authority_id_authority_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."authority"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "civic_issue" ADD CONSTRAINT "civic_issue_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversation_id_issue_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."issue_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_member_id_authority_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."authority_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_added_by_member_id_authority_member_id_fk" FOREIGN KEY ("added_by_member_id") REFERENCES "public"."authority_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_authority_id_authority_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."authority"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_conversation" ADD CONSTRAINT "issue_conversation_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_conversation" ADD CONSTRAINT "issue_conversation_created_by_member_id_authority_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."authority_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_message" ADD CONSTRAINT "issue_message_conversation_id_issue_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."issue_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_message" ADD CONSTRAINT "issue_message_member_id_authority_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."authority_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_report" ADD CONSTRAINT "issue_report_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_report" ADD CONSTRAINT "issue_report_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_status_event" ADD CONSTRAINT "issue_status_event_issue_id_civic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."civic_issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_status_event" ADD CONSTRAINT "issue_status_event_member_id_authority_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."authority_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_message_id_issue_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."issue_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_member_id_authority_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."authority_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authority_member_user_id_idx" ON "authority_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "authority_member_department_id_idx" ON "authority_member" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "civic_issue_authority_idx" ON "civic_issue" USING btree ("authority_id");--> statement-breakpoint
CREATE INDEX "civic_issue_department_idx" ON "civic_issue" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "civic_issue_status_idx" ON "civic_issue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "civic_issue_category_idx" ON "civic_issue" USING btree ("category");--> statement-breakpoint
CREATE INDEX "conversation_participant_conversation_idx" ON "conversation_participant" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participant_unique_idx" ON "conversation_participant" USING btree ("conversation_id","member_id");--> statement-breakpoint
CREATE INDEX "department_authority_id_idx" ON "department" USING btree ("authority_id");--> statement-breakpoint
CREATE UNIQUE INDEX "department_authority_slug_idx" ON "department" USING btree ("authority_id","slug");--> statement-breakpoint
CREATE INDEX "issue_conversation_issue_idx" ON "issue_conversation" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_message_conversation_idx" ON "issue_message" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "issue_report_issue_idx" ON "issue_report" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_status_event_issue_idx" ON "issue_status_event" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "message_mention_message_idx" ON "message_mention" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_mention_member_idx" ON "message_mention" USING btree ("member_id");