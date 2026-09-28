-- The currency of each consensus estimate, so TSM's revenue (TWD) stops rendering as dollars. EPS and revenue can
-- differ: Yahoo gives TSM's EPS per ADR in USD and its revenue in TWD. Null means unknown and renders with no symbol.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0024_earnings_currency.sql
-- Additive only. The morning job fills both columns for upcoming reports on its next run.
ALTER TABLE "earnings" ADD COLUMN IF NOT EXISTS "eps_currency" text;
ALTER TABLE "earnings" ADD COLUMN IF NOT EXISTS "revenue_currency" text;
