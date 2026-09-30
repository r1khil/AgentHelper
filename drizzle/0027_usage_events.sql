-- What members do in the app, for deciding what to improve: one row per page view (with the time it was in view and the
-- page's load metrics), plus a few named actions (the ⌘K/⌘J palette, Hoot questions, the sidebar) and client errors.
-- Never what anyone typed. Rows older than 90 days are deleted nightly so the table stays a few MB.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0027_usage_events.sql
CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid REFERENCES "public"."profiles"("id") ON DELETE cascade,
  "session_id" text,
  "name" text NOT NULL,
  "route" text,
  "team" text,
  "props" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "env" text DEFAULT 'production' NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_at" ON "usage_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_name_at" ON "usage_events" USING btree ("name", "at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_user_at" ON "usage_events" USING btree ("user_id", "at");--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
select cron.schedule('usage-events-retention', '17 4 * * *', $$delete from public.usage_events where at < now() - interval '90 days'$$);
