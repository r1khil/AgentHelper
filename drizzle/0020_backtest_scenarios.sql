-- Saved what-if scenarios from the Backtesting page, so a proposed rebalance can be shared by link (for an IC meeting).
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0020_backtest_scenarios.sql
-- Nothing existing is changed; the table is new.
CREATE TABLE IF NOT EXISTS "backtest_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "note" text,
  -- Null is the whole Fund (execs and admins); otherwise the team whose holdings it was built on.
  "team_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade,
  "created_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  -- Hash of the saved holdings the scenario started from; a mismatch means holdings changed since.
  "base_version" text NOT NULL,
  -- Scenario weight in percent by ticker, including CASH, plus the saved weights at the time for comparison.
  "weights" jsonb NOT NULL,
  "base_weights" jsonb NOT NULL,
  -- Companies added only to the scenario: [{ "ticker", "name" }].
  "added" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "benchmark" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backtest_scenarios_scope" ON "backtest_scenarios" USING btree ("team_id", "created_at");--> statement-breakpoint
ALTER TABLE "backtest_scenarios" ENABLE ROW LEVEL SECURITY;
-- Access is through authenticated, role-checked server code (the fund's scenarios for execs and admins, a team's
-- for its members); no public policies.
