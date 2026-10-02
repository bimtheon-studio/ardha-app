CREATE TABLE "hydrants" (
	"id" text PRIMARY KEY NOT NULL,
	"cell" text NOT NULL,
	"point" geometry(Point, 4326) NOT NULL,
	"type" text,
	"flow_rate" text,
	"diameter" text,
	"ref" text
);
--> statement-breakpoint
CREATE INDEX "hydrants_cell_index" ON "hydrants" USING btree ("cell");--> statement-breakpoint
CREATE INDEX "hydrants_point_index" ON "hydrants" USING gist ("point");