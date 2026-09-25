-- Full holdings of the ETFs the Fund owns, plus SPY and the Select Sector SPDRs, for the look-through view on
-- Exposure: combined exposure per stock, sector weights through the ETFs, stock-level active weights and Active Share.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0021_etf_constituents.sql
-- Nothing existing is changed; the table is new. The nightly price job fills it and skips it while it doesn't exist.
CREATE TABLE IF NOT EXISTS "etf_constituents" (
  "etf" text NOT NULL,
  -- The date the issuer says the list is as of (for the Yahoo fallback, the day it was fetched).
  "as_of" date NOT NULL,
  -- Yahoo-style symbol: BRK-B, and an exchange suffix on foreign listings (K.TO, 000660.KS).
  "symbol" text NOT NULL,
  "name" text NOT NULL,
  -- Percent of the ETF's net assets, as the issuer reports it. Cash, collateral, futures and swaps that can't be
  -- tied to a stock are not stored, so the weights of one list add up to what was looked through (its coverage).
  "weight" numeric(10, 6) NOT NULL,
  -- GICS sector when the issuer states it (iShares, the sector SPDRs); otherwise null.
  "sector" "gics_sector",
  -- ssga | ishares | first-trust | roundhill | yahoo-top10
  "source" text NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "etf_constituents_pkey" PRIMARY KEY ("etf", "as_of", "symbol"),
  CONSTRAINT "etf_constituents_weight_positive" CHECK ("weight" > 0)
);--> statement-breakpoint
-- Which ETFs hold a given stock.
CREATE INDEX IF NOT EXISTS "etf_constituents_symbol" ON "etf_constituents" USING btree ("symbol");--> statement-breakpoint
ALTER TABLE "etf_constituents" ENABLE ROW LEVEL SECURITY;
-- Read and written only by server code (the price job and the Exposure loader); no public policies.
