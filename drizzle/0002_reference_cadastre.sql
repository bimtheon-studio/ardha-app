CREATE TYPE "public"."source_status" AS ENUM('queued', 'loading', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "communes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department_code" text NOT NULL,
	"postcodes" text[] DEFAULT '{}'::text[] NOT NULL,
	"center" geometry(Point, 4326),
	"contour" geometry(MultiPolygon, 4326),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" text PRIMARY KEY NOT NULL,
	"commune_code" text NOT NULL,
	"prefix" text NOT NULL,
	"section" text NOT NULL,
	"number" text NOT NULL,
	"contenance" integer,
	"geometry" geometry(MultiPolygon, 4326) NOT NULL,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_states" (
	"source" text NOT NULL,
	"scope" text NOT NULL,
	"status" "source_status" NOT NULL,
	"version" text,
	"item_count" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"loaded_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_states_source_scope_pk" PRIMARY KEY("source","scope")
);
--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_commune_code_communes_code_fk" FOREIGN KEY ("commune_code") REFERENCES "public"."communes"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parcels_commune_code_index" ON "parcels" USING btree ("commune_code");--> statement-breakpoint
CREATE INDEX "parcels_geometry_index" ON "parcels" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "source_states_status_index" ON "source_states" USING btree ("status");