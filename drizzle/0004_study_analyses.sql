CREATE TYPE "public"."analysis_kind" AS ENUM('risks');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('queued', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "study_analyses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"study_id" uuid NOT NULL,
	"kind" "analysis_kind" NOT NULL,
	"status" "analysis_status" NOT NULL,
	"parcels_key" text NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"computed_at" timestamp with time zone,
	CONSTRAINT "study_analyses_study_kind_unique" UNIQUE("study_id","kind")
);
--> statement-breakpoint
ALTER TABLE "study_analyses" ADD CONSTRAINT "study_analyses_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_analyses_status_index" ON "study_analyses" USING btree ("status");