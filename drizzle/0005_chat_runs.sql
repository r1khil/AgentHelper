-- Track in-flight agent runs so a chat keeps working when the analyst navigates away,
-- and so a returning page knows to poll for the finished answer.
ALTER TABLE "chats" ADD COLUMN "run_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "run_started_at" timestamp with time zone;
