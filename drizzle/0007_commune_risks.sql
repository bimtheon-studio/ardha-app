CREATE TABLE "commune_risks" (
	"commune_code" text NOT NULL,
	"part" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "commune_risks_commune_code_part_pk" PRIMARY KEY("commune_code","part")
);
