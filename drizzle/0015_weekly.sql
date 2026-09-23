-- Weekly portfolio update pack: one row per Friday, plus the process-update ask sent to each exec.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0015_weekly.sql
-- Nothing existing is changed; both tables are new.
DO $$ BEGIN
  CREATE TYPE "public"."weekly_status" AS ENUM('draft', 'sent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_updates" (
  "week_ending" date PRIMARY KEY NOT NULL,
  "status" "public"."weekly_status" DEFAULT 'draft' NOT NULL,
  -- AUM ($k), fund YTD %, SPXTR YTD %, each with source 'entered' | 'carried'.
  "figures" jsonb,
  "performers" jsonb,
  "agenda" jsonb,
  "last_week_agenda" jsonb,
  -- Unused until the app may read the price target sheet; the YTD chart is pasted by hand.
  "chart" jsonb,
  "sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "built_at" timestamp with time zone,
  "edited_at" timestamp with time zone,
  "edited_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "sent_at" timestamp with time zone,
  "sent_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "week_ending" date NOT NULL REFERENCES "public"."weekly_updates"("week_ending") ON DELETE cascade,
  "recipient_id" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "recipient_email" text NOT NULL,
  -- Random per request: the token is what makes the reply address unguessable.
  "token" text NOT NULL UNIQUE,
  "reply_address" text NOT NULL,
  "sent_at" timestamp with time zone,
  "send_error" text,
  "resend_id" text,
  "reminded_at" timestamp with time zone,
  "replied_at" timestamp with time zone,
  -- Unique, so an inbound webhook Resend delivers twice is applied once.
  "reply_email_id" text UNIQUE,
  "reply_from" text,
  "reply_text" text,
  "parsed_items" jsonb,
  "parse_model" text,
  "parse_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_requests_week_recipient" ON "weekly_requests" USING btree ("week_ending", "recipient_email");--> statement-breakpoint
ALTER TABLE "weekly_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_requests" ENABLE ROW LEVEL SECURITY;
-- Access is through authenticated, role-checked server routes (exec and admin only); no public policies.
