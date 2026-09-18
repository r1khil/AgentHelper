ALTER TABLE "securities" ADD COLUMN "industry" text;--> statement-breakpoint
CREATE TABLE "sector_bellwethers" (
	"ticker" text PRIMARY KEY NOT NULL,
	"sector" "gics_sector" NOT NULL,
	"etf" text NOT NULL,
	"name" text NOT NULL,
	"weight_pct" numeric(7, 4),
	"industry" text,
	"report_date" date,
	"report_hour" text,
	"date_status" "date_status",
	"eps_estimate" numeric(12, 4),
	"date_source_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "sector_bellwethers_sector" ON "sector_bellwethers" USING btree ("sector");--> statement-breakpoint
ALTER TABLE "sector_bellwethers" ENABLE ROW LEVEL SECURITY;
