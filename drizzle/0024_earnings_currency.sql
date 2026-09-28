-- The currency of each consensus estimate, so TSM's revenue (TWD) stops rendering as dollars. EPS and revenue can
-- differ: Yahoo gives TSM's EPS per ADR in USD and its revenue in TWD. Null means unknown and renders with no symbol.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0024_earnings_currency.sql
-- Applied to prod 2026-09-28 via MCP apply_migration, with the one-time backfill below for the 17 existing rows (all
-- upcoming). The backfill assumes the stored figures came from Yahoo (TSM EPS per ADR in USD, revenue in TWD).
ALTER TABLE "earnings" ADD COLUMN IF NOT EXISTS "eps_currency" text;
--> statement-breakpoint
ALTER TABLE "earnings" ADD COLUMN IF NOT EXISTS "revenue_currency" text;
--> statement-breakpoint
UPDATE "earnings" e SET
  eps_currency = coalesce(e.eps_currency, 'USD'),
  revenue_currency = coalesce(e.revenue_currency, CASE WHEN h.ticker = 'TSM' THEN 'TWD' ELSE 'USD' END)
FROM "holdings" h
WHERE h.id = e.holding_id AND (e.eps_currency IS NULL OR e.revenue_currency IS NULL);
