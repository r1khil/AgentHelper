CREATE TYPE "public"."gics_sector" AS ENUM('information_technology', 'financials', 'health_care', 'consumer_discretionary', 'consumer_staples', 'energy', 'industrials', 'materials', 'utilities', 'real_estate', 'communication_services');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."trade_kind" AS ENUM('opening', 'trade');--> statement-breakpoint
CREATE TYPE "public"."cash_flow_kind" AS ENUM('deposit', 'withdrawal', 'fee', 'interest');--> statement-breakpoint
CREATE TYPE "public"."security_event_kind" AS ENUM('dividend', 'split');--> statement-breakpoint
CREATE TYPE "public"."sector_source" AS ENUM('yahoo', 'default', 'manual');--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "shares" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
CREATE TABLE "securities" (
	"ticker" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" "gics_sector",
	"sector_source" "sector_source",
	"yahoo_sector" text,
	"team_id" uuid REFERENCES "public"."teams"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_date" date NOT NULL,
	"ticker" text NOT NULL REFERENCES "public"."securities"("ticker"),
	"side" "trade_side" NOT NULL,
	"kind" "trade_kind" DEFAULT 'trade' NOT NULL,
	"shares" numeric(18, 6) NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	"fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
	"voided_at" timestamp with time zone,
	"voided_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_positive" CHECK ("shares" > 0 and "price" > 0 and "fees" >= 0)
);--> statement-breakpoint
CREATE INDEX "trades_ticker_date" ON "trades" USING btree ("ticker","trade_date");--> statement-breakpoint
CREATE TABLE "cash_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_date" date NOT NULL,
	"kind" "cash_flow_kind" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"note" text,
	"created_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
	"voided_at" timestamp with time zone,
	"voided_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flows_positive" CHECK ("amount" > 0)
);--> statement-breakpoint
CREATE TABLE "security_events" (
	"ticker" text NOT NULL,
	"ex_date" date NOT NULL,
	"kind" "security_event_kind" NOT NULL,
	"amount" numeric(18, 6),
	"ratio" numeric(12, 6),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_events_pk" PRIMARY KEY("ticker","ex_date","kind")
);--> statement-breakpoint
CREATE TABLE "benchmark_sector_weights" (
	"as_of" date NOT NULL,
	"sector" "gics_sector" NOT NULL,
	"weight_pct" numeric(7, 4) NOT NULL,
	"source" text,
	"updated_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_sector_weights_pk" PRIMARY KEY("as_of","sector")
);--> statement-breakpoint
CREATE TABLE "team_sectors" (
	"sector" "gics_sector" PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade
);--> statement-breakpoint
ALTER TABLE "securities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_flows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "benchmark_sector_weights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_sectors" ENABLE ROW LEVEL SECURITY;
