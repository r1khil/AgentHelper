-- Hoot, the in-app companion: per-member visibility and dismissed nudges.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0016_hoot.sql
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "hoot" jsonb DEFAULT '{}'::jsonb NOT NULL;
