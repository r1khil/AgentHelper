-- Chats that have read the execs' price target sheet become fund-only: only execs and admins can list, open or
-- continue them, whichever team the chat is filed under. Hoot sets the flag the moment it reads the sheet.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0022_chat_fund_only.sql
-- Additive only: every existing chat keeps its current visibility (false).
ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "fund_only" boolean DEFAULT false NOT NULL;
