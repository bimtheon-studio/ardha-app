CREATE TABLE "studies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_is_provisional" boolean DEFAULT true NOT NULL,
	"commune_code" text NOT NULL,
	"commune_name" text,
	"address" jsonb,
	"addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen_address_id" text,
	"parcels_key" text NOT NULL,
	"address_key" text,
	"thumbnail_key" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_parcels" (
	"study_id" uuid NOT NULL,
	"parcel_id" text NOT NULL,
	"position" integer NOT NULL,
	"commune_code" text NOT NULL,
	"prefix" text NOT NULL,
	"section" text NOT NULL,
	"number" text NOT NULL,
	"contenance" integer,
	"area" double precision NOT NULL,
	"geometry" geometry(MultiPolygon, 4326) NOT NULL,
	"version" text NOT NULL,
	CONSTRAINT "study_parcels_study_id_parcel_id_pk" PRIMARY KEY("study_id","parcel_id")
);
--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_parcels" ADD CONSTRAINT "study_parcels_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studies_owner_id_updated_at_index" ON "studies" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "studies_deleted_at_index" ON "studies" USING btree ("deleted_at");