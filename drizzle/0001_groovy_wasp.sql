CREATE TABLE "registration_session" (
	"id" text PRIMARY KEY NOT NULL,
	"step" text DEFAULT 'identity' NOT NULL,
	"data" text DEFAULT '{}' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"father_name" text,
	"cnic_hash" text NOT NULL,
	"cnic_masked" text NOT NULL,
	"cnic_encrypted" text NOT NULL,
	"date_of_birth" text,
	"gender" text,
	"identity_source" text DEFAULT 'manual' NOT NULL,
	"phone" text NOT NULL,
	"city" text,
	"sector" text,
	"street" text,
	"road" text,
	"residential_address" text,
	"profile_image_path" text,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"assisted_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_profile_cnic_hash_unique" UNIQUE("cnic_hash")
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registration_session_expires_at_idx" ON "registration_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_profile_user_id_idx" ON "user_profile" USING btree ("user_id");