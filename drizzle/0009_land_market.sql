ALTER TYPE "public"."analysis_kind" ADD VALUE 'market';--> statement-breakpoint
CREATE TABLE "dvf_mutations" (
	"id" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"department_code" text NOT NULL,
	"commune_code" text NOT NULL,
	"date" date NOT NULL,
	"nature" text NOT NULL,
	"vefa" boolean NOT NULL,
	"price" double precision NOT NULL,
	"property_type" text NOT NULL,
	"dwelling_count" integer NOT NULL,
	"built_area" double precision,
	"land_area" double precision,
	"rooms" integer,
	"category" text,
	"price_per_sqm" double precision,
	"parcel_ids" text[] NOT NULL,
	"address" text,
	"postcode" text,
	"point" geometry(Point, 4326),
	"locals" jsonb NOT NULL,
	"cultures" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "housing_permits" (
	"commune_code" text NOT NULL,
	"year" integer NOT NULL,
	"housing_type" text NOT NULL,
	"authorized_units" integer,
	"started_units" integer,
	"authorized_area" integer,
	"started_area" integer,
	CONSTRAINT "housing_permits_commune_code_year_housing_type_pk" PRIMARY KEY("commune_code","year","housing_type")
);
--> statement-breakpoint
CREATE TABLE "index_values" (
	"series" text NOT NULL,
	"period" text NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "index_values_series_period_pk" PRIMARY KEY("series","period")
);
--> statement-breakpoint
CREATE TABLE "new_build_prices" (
	"department_code" text NOT NULL,
	"quarter" text NOT NULL,
	"housing_type" text NOT NULL,
	"listed" integer,
	"reservations" integer,
	"cancellations" integer,
	"stock" integer,
	"months_to_sell" double precision,
	"price_per_sqm" double precision,
	"average_price" double precision,
	CONSTRAINT "new_build_prices_department_code_quarter_housing_type_pk" PRIMARY KEY("department_code","quarter","housing_type")
);
--> statement-breakpoint
ALTER TABLE "studies" ADD COLUMN "market_radius_m" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
CREATE INDEX "dvf_mutations_department_code_year_index" ON "dvf_mutations" USING btree ("department_code","year");--> statement-breakpoint
CREATE INDEX "dvf_mutations_point_index" ON "dvf_mutations" USING gist ("point");