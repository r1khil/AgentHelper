-- Screener (the Proactive Screener spec, rev 3): the team watchlist, the monthly whole-market screen and its hits, Hoot's
-- tear sheets on those hits, filing-change flags and the flags feed, the bear case and the calibration log.
-- Screen working sets live in the Supabase Storage bucket `screener` (private), not here, so the database grows under
-- 20 MB a year. Dismissed flags older than 12 months are deleted nightly.
-- The cron jobs need the Vault secrets `cron_secret` and `app_url` from 0017.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0028_screener.sql
CREATE TABLE IF NOT EXISTS "watchlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade,
  "ticker" text NOT NULL,
  "company_name" text NOT NULL,
  "cik" text,
  "added_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_team_ticker" ON "watchlist" USING btree ("team_id", "ticker");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "screen_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_date" date NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "universe_size" integer,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "storage_path" text NOT NULL,
  "checkpoint" jsonb DEFAULT '{"conceptsDone":[],"pricesDone":0,"stage":"universe"}'::jsonb NOT NULL,
  "coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "job_run_id" uuid REFERENCES "public"."job_runs"("id") ON DELETE set null,
  "error" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "screen_hits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "public"."screen_runs"("id") ON DELETE cascade,
  "ticker" text NOT NULL,
  "cik" text NOT NULL,
  "company_name" text NOT NULL,
  "track" text NOT NULL,
  "sic" text,
  "sector" "gics_sector",
  "team_id" uuid REFERENCES "public"."teams"("id") ON DELETE set null,
  "metrics" jsonb NOT NULL,
  "period_end" date,
  "rank" integer NOT NULL,
  "team_rank" integer,
  "price" numeric(18, 6),
  "market_cap" numeric(20, 2),
  "accessions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "screen_hits_run_ticker" ON "screen_hits" USING btree ("run_id", "ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "screen_hits_team" ON "screen_hits" USING btree ("team_id", "run_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tear_sheets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "screen_hit_id" uuid REFERENCES "public"."screen_hits"("id") ON DELETE set null,
  "ticker" text NOT NULL,
  "source_accession" text NOT NULL,
  "body" jsonb,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text NOT NULL,
  "held_reason" text,
  "model" text,
  "rating" text,
  "rated_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tear_sheets_ticker_accession" ON "tear_sheets" USING btree ("ticker", "source_accession");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "filing_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticker" text NOT NULL,
  "cik" text NOT NULL,
  "form" text NOT NULL,
  "accession" text NOT NULL,
  "prior_accession" text,
  "filed_at" date NOT NULL,
  "item" text NOT NULL,
  "kind" text NOT NULL,
  "label" text,
  "summary" text,
  "quote" text,
  "filing_url" text NOT NULL,
  "change_score" numeric(6, 4),
  "diff" jsonb,
  "status" text DEFAULT 'queued' NOT NULL,
  "priority" smallint DEFAULT 3 NOT NULL,
  "verdict" text,
  "verdict_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "verdict_at" timestamp with time zone,
  "dismissed_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_changes_ticker" ON "filing_changes" USING btree ("ticker", "filed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_changes_queue" ON "filing_changes" USING btree ("status", "priority", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "filing_changes_dedupe" ON "filing_changes" USING btree ("accession", "item", "label");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticker" text NOT NULL,
  "kind" text NOT NULL,
  "source_id" uuid NOT NULL,
  "title" text NOT NULL,
  "href" text,
  "dismissed_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "dismissed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "flags_kind_source" ON "flags" USING btree ("kind", "source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flags_open" ON "flags" USING btree ("ticker", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bear_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticker" text NOT NULL,
  "team_id" uuid REFERENCES "public"."teams"("id") ON DELETE set null,
  "pitch_id" uuid,
  "pitch" text,
  "checklist" jsonb NOT NULL,
  "memo" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text NOT NULL,
  "held_reason" text,
  "model" text,
  "created_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pitch_estimates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticker" text NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade,
  "cohort" text NOT NULL,
  "pitched_on" date NOT NULL,
  "price_at_pitch" numeric(18, 6),
  "intrinsic_value" numeric(18, 4) NOT NULL,
  "price_target" numeric(18, 4) NOT NULL,
  "horizon_months" smallint NOT NULL,
  "confidence" smallint NOT NULL,
  "key_metric" text NOT NULL,
  "kill_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "outcome" jsonb,
  "created_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pitch_estimates_team" ON "pitch_estimates" USING btree ("team_id", "pitched_on");--> statement-breakpoint
ALTER TABLE "watchlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "screen_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "screen_hits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tear_sheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "filing_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bear_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pitch_estimates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO storage.buckets (id, name, public) VALUES ('screener', 'screener', false) ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
select cron.schedule('flags-retention', '23 4 * * *', $$delete from public.flags where dismissed_at < now() - interval '12 months'$$);
--> statement-breakpoint
-- Filing changes: every 10 minutes through the NY evening (22:00–03:59 UTC). Each call works until its time budget and
-- saves its place; a call with an empty queue and nothing new to list returns at once.
select cron.schedule('filing-changes', '*/10 22,23,0,1,2,3 * * *', $$select public.call_app_cron('/api/cron/filing-changes')$$);--> statement-breakpoint
-- The monthly screen: every 10 minutes. The route starts a run on the month's first Saturday, continues a run in
-- progress from its checkpoint (one started from Admin on any day), and otherwise returns after one small read. It
-- never sends email.
select cron.schedule('monthly-screen', '*/10 * * * *', $$select public.call_app_cron('/api/cron/screen')$$);
