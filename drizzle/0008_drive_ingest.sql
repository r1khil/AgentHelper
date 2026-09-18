-- Drive ingestion: per-document summaries, embedding chunks (pgvector), change-notification channel, thesis proposals.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0008_drive_ingest.sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;--> statement-breakpoint
ALTER TABLE "drive_files"
  ADD COLUMN "summary" jsonb,
  ADD COLUMN "summary_model" text,
  ADD COLUMN "summary_version" smallint,
  ADD COLUMN "summary_modified_time" timestamp with time zone,
  ADD COLUMN "summary_error" text,
  ADD COLUMN "summarized_at" timestamp with time zone,
  ADD COLUMN "doc_date" date,
  ADD COLUMN "embed_model" text,
  ADD COLUMN "embed_modified_time" timestamp with time zone,
  ADD COLUMN "embed_error" text,
  ADD COLUMN "embedded_at" timestamp with time zone,
  ADD COLUMN "ingest_attempts" smallint DEFAULT 0 NOT NULL,
  ADD COLUMN "ingest_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "drive_files_ingest" ON "drive_files" USING btree ("holding_id", "modified_time" DESC) WHERE "is_folder" = false AND "holding_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "drive_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_id" text NOT NULL REFERENCES "public"."drive_files"("id") ON DELETE cascade,
  "holding_id" uuid REFERENCES "public"."holdings"("id") ON DELETE set null,
  "ticker" text,
  "seq" integer NOT NULL,
  "text" text NOT NULL,
  "embedding" extensions.vector(1536) NOT NULL,
  "model" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "drive_chunks_file_seq" UNIQUE ("file_id", "seq")
);--> statement-breakpoint
CREATE INDEX "drive_chunks_holding" ON "drive_chunks" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "drive_chunks_ticker" ON "drive_chunks" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "drive_chunks_embedding" ON "drive_chunks" USING hnsw ("embedding" extensions.vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "drive_connection"
  ADD COLUMN "start_page_token" text,
  ADD COLUMN "channel_id" text,
  ADD COLUMN "channel_resource_id" text,
  ADD COLUMN "channel_secret" text,
  ADD COLUMN "channel_expiration" timestamp with time zone,
  ADD COLUMN "watch_error" text,
  ADD COLUMN "change_notified_at" timestamp with time zone,
  ADD COLUMN "last_change_sync_at" timestamp with time zone,
  ADD COLUMN "ingest_started_at" timestamp with time zone;--> statement-breakpoint
CREATE TYPE "public"."holding_proposal_status" AS ENUM('pending', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "holding_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "holding_id" uuid NOT NULL REFERENCES "public"."holdings"("id") ON DELETE cascade,
  "field" text NOT NULL,
  "proposed" text NOT NULL,
  "rationale" text,
  "source_file_id" text REFERENCES "public"."drive_files"("id") ON DELETE set null,
  "source_file_name" text,
  "source_modified_time" timestamp with time zone,
  "status" "public"."holding_proposal_status" DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "holding_proposals_field" CHECK ("field" IN ('thesis'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "holding_proposals_one_pending" ON "holding_proposals" USING btree ("holding_id", "field") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "holding_proposals_holding" ON "holding_proposals" USING btree ("holding_id");--> statement-breakpoint
ALTER TABLE "drive_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holding_proposals" ENABLE ROW LEVEL SECURITY;
