CREATE TABLE "complaint_assignee" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"officer_id" text NOT NULL,
	"added_by_officer_id" text,
	"added_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"author_officer_id" text,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaint_assignment" DROP CONSTRAINT "complaint_assignment_assigned_officer_id_officer_id_fk";
--> statement-breakpoint
DROP INDEX "complaint_assignment_officer_idx";--> statement-breakpoint
ALTER TABLE "complaint_assignee" ADD CONSTRAINT "complaint_assignee_assignment_id_complaint_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."complaint_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignee" ADD CONSTRAINT "complaint_assignee_officer_id_officer_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignee" ADD CONSTRAINT "complaint_assignee_added_by_officer_id_officer_id_fk" FOREIGN KEY ("added_by_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_chat_message" ADD CONSTRAINT "complaint_chat_message_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_chat_message" ADD CONSTRAINT "complaint_chat_message_author_officer_id_officer_id_fk" FOREIGN KEY ("author_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaint_assignee_assignment_idx" ON "complaint_assignee" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "complaint_assignee_officer_idx" ON "complaint_assignee" USING btree ("officer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_assignee_unique" ON "complaint_assignee" USING btree ("assignment_id","officer_id");--> statement-breakpoint
CREATE INDEX "complaint_chat_message_report_idx" ON "complaint_chat_message" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "complaint_chat_message_created_at_idx" ON "complaint_chat_message" USING btree ("created_at");--> statement-breakpoint
--> statement-breakpoint
/*
 * Backfill, added by hand — drizzle-kit generates the DROP COLUMN below but
 * cannot know the data has to move first.
 *
 * Every complaint that already had a single assignee becomes one row in the
 * new join table, so no in-flight work loses the person responsible for it.
 * `added_by_officer_id` is NULL because the original assignment predates the
 * column that records who made it, and inventing an actor would be a lie in
 * an audit trail.
 */
INSERT INTO "complaint_assignee" ("id", "assignment_id", "officer_id", "added_by_officer_id", "added_at")
SELECT gen_random_uuid()::text, "id", "assigned_officer_id", NULL, "created_at"
FROM "complaint_assignment"
WHERE "assigned_officer_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "complaint_assignment" DROP COLUMN "assigned_officer_id";