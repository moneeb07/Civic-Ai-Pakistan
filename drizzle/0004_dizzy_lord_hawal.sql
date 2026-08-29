CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"image_path" text,
	"image_mime_type" text,
	"category" text,
	"category_source" text,
	"vision_confidence" double precision,
	"vision_evidence" text,
	"vision_confirmed" boolean DEFAULT false NOT NULL,
	"transcript" text,
	"transcript_language" text,
	"transcript_source" text,
	"latitude" double precision,
	"longitude" double precision,
	"location_accuracy_meters" double precision,
	"location_label" text,
	"location_source" text,
	"title" text,
	"title_source" text,
	"description" text,
	"description_source" text,
	"severity" text,
	"severity_source" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_user_id_idx" ON "report" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_created_at_idx" ON "report" USING btree ("created_at");