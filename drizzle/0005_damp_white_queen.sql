CREATE TABLE "citizen_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "complaint_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"org_id" text NOT NULL,
	"dept_id" text NOT NULL,
	"current_stage_id" text,
	"assigned_officer_id" text,
	"ai_suggested_org_id" text,
	"ai_suggested_dept_id" text,
	"ai_confidence" double precision,
	"ai_reasoning" text,
	"ai_suggestion_source" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "complaint_assignment_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "complaint_event" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text,
	"dept_id" text,
	"actor_officer_id" text,
	"event_type" text NOT NULL,
	"metadata" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "complaint_event_subject_check" CHECK (("complaint_event"."report_id" IS NOT NULL) <> ("complaint_event"."dept_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "complaint_rating" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"citizen_user_id" text NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"rated_at" timestamp NOT NULL,
	CONSTRAINT "complaint_rating_report_id_unique" UNIQUE("report_id"),
	CONSTRAINT "complaint_rating_stars_check" CHECK ("complaint_rating"."stars" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "complaint_stage_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"entered_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"completed_by_officer_id" text,
	"photo_url" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "department" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"handles_categories" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dept_workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"dept_id" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by_officer_id" text,
	CONSTRAINT "dept_workflow_dept_id_unique" UNIQUE("dept_id")
);
--> statement-breakpoint
CREATE TABLE "dept_workflow_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"requires_photo" boolean DEFAULT false NOT NULL,
	"requires_note" boolean DEFAULT false NOT NULL,
	"sla_hours" integer,
	"is_terminal" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "officer" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"org_id" text,
	"dept_id" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "officer_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "officer_role_scope_check" CHECK ((
        ("officer"."role" = 'platform_admin' AND "officer"."org_id" IS NULL AND "officer"."dept_id" IS NULL)
        OR ("officer"."role" = 'org_head' AND "officer"."org_id" IS NOT NULL AND "officer"."dept_id" IS NULL)
        OR ("officer"."role" IN ('dept_head', 'member') AND "officer"."org_id" IS NOT NULL AND "officer"."dept_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "officer_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"org_id" text,
	"dept_id" text,
	"token" text NOT NULL,
	"created_by_officer_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "officer_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "citizen_notification" ADD CONSTRAINT "citizen_notification_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_notification" ADD CONSTRAINT "citizen_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_dept_id_department_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_current_stage_id_dept_workflow_stage_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."dept_workflow_stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_assigned_officer_id_officer_id_fk" FOREIGN KEY ("assigned_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_ai_suggested_org_id_organization_id_fk" FOREIGN KEY ("ai_suggested_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_assignment" ADD CONSTRAINT "complaint_assignment_ai_suggested_dept_id_department_id_fk" FOREIGN KEY ("ai_suggested_dept_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_event" ADD CONSTRAINT "complaint_event_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_event" ADD CONSTRAINT "complaint_event_dept_id_department_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_event" ADD CONSTRAINT "complaint_event_actor_officer_id_officer_id_fk" FOREIGN KEY ("actor_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_rating" ADD CONSTRAINT "complaint_rating_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_rating" ADD CONSTRAINT "complaint_rating_citizen_user_id_user_id_fk" FOREIGN KEY ("citizen_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_stage_progress" ADD CONSTRAINT "complaint_stage_progress_assignment_id_complaint_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."complaint_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_stage_progress" ADD CONSTRAINT "complaint_stage_progress_stage_id_dept_workflow_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."dept_workflow_stage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_stage_progress" ADD CONSTRAINT "complaint_stage_progress_completed_by_officer_id_officer_id_fk" FOREIGN KEY ("completed_by_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dept_workflow" ADD CONSTRAINT "dept_workflow_dept_id_department_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dept_workflow" ADD CONSTRAINT "dept_workflow_updated_by_officer_id_officer_id_fk" FOREIGN KEY ("updated_by_officer_id") REFERENCES "public"."officer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dept_workflow_stage" ADD CONSTRAINT "dept_workflow_stage_workflow_id_dept_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."dept_workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer" ADD CONSTRAINT "officer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer" ADD CONSTRAINT "officer_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer" ADD CONSTRAINT "officer_dept_id_department_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_invite" ADD CONSTRAINT "officer_invite_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_invite" ADD CONSTRAINT "officer_invite_dept_id_department_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_invite" ADD CONSTRAINT "officer_invite_created_by_officer_id_officer_id_fk" FOREIGN KEY ("created_by_officer_id") REFERENCES "public"."officer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citizen_notification_report_id_idx" ON "citizen_notification" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "citizen_notification_user_id_idx" ON "citizen_notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "complaint_assignment_report_id_idx" ON "complaint_assignment" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "complaint_assignment_dept_id_idx" ON "complaint_assignment" USING btree ("dept_id");--> statement-breakpoint
CREATE INDEX "complaint_assignment_org_id_idx" ON "complaint_assignment" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "complaint_assignment_officer_idx" ON "complaint_assignment" USING btree ("assigned_officer_id");--> statement-breakpoint
CREATE INDEX "complaint_event_report_id_idx" ON "complaint_event" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "complaint_event_dept_id_idx" ON "complaint_event" USING btree ("dept_id");--> statement-breakpoint
CREATE INDEX "complaint_event_created_at_idx" ON "complaint_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "complaint_rating_report_id_idx" ON "complaint_rating" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "complaint_stage_progress_assignment_idx" ON "complaint_stage_progress" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "complaint_stage_progress_entered_at_idx" ON "complaint_stage_progress" USING btree ("entered_at");--> statement-breakpoint
CREATE INDEX "department_org_id_idx" ON "department" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "department_org_id_name_key" ON "department" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "dept_workflow_dept_id_idx" ON "dept_workflow" USING btree ("dept_id");--> statement-breakpoint
CREATE INDEX "dept_workflow_stage_workflow_id_idx" ON "dept_workflow_stage" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dept_workflow_stage_position_key" ON "dept_workflow_stage" USING btree ("workflow_id","position");--> statement-breakpoint
CREATE INDEX "officer_user_id_idx" ON "officer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "officer_org_id_idx" ON "officer" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "officer_dept_id_idx" ON "officer" USING btree ("dept_id");--> statement-breakpoint
CREATE INDEX "officer_invite_token_idx" ON "officer_invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX "officer_invite_created_by_idx" ON "officer_invite" USING btree ("created_by_officer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "officer_invite_pending_email_key" ON "officer_invite" USING btree ("email") WHERE used_at IS NULL;--> statement-breakpoint
CREATE INDEX "organization_code_idx" ON "organization" USING btree ("code");