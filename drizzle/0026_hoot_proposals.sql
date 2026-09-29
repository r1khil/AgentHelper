-- Audit trail for the changes Hoot proposes (add a note, pin a chat, dismiss a nudge, record trades from a ticket):
-- one row per proposal, updated as the member confirms or cancels and as the change succeeds or fails, with every step
-- kept in `history`. The live state stays on the proposal in chat_messages; this table is the durable record and
-- outlives the chat. Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0026_hoot_proposals.sql
CREATE TABLE IF NOT EXISTS "hoot_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chat_id" uuid REFERENCES "public"."chats"("id") ON DELETE set null,
  "tool_call_id" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('add_note', 'pin_chat', 'dismiss_nudge', 'record_trades_from_ticket')),
  "summary" text NOT NULL,
  "proposal" jsonb NOT NULL,
  "proposed_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL CHECK ("status" IN ('proposed', 'pending', 'done', 'failed', 'cancelled')),
  "decided_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "decided_at" timestamp with time zone,
  "result" jsonb,
  "history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "hoot_proposals_chat_call" UNIQUE ("chat_id", "tool_call_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hoot_proposals_by_member" ON "hoot_proposals" USING btree ("proposed_by", "proposed_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hoot_proposals_status" ON "hoot_proposals" USING btree ("status", "proposed_at" DESC);--> statement-breakpoint
ALTER TABLE "hoot_proposals" ENABLE ROW LEVEL SECURITY;
