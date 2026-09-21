-- Unified document corpus (Drive files + SEC filings), hybrid search (vector + full text), switchable embedding models.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0013_documents.sql
-- Needs pgvector >= 0.7 for halfvec (Supabase ships it; check Database → Extensions).
-- The partial HNSW index at the end is created for the default embedding model; ensureEmbeddingIndex() adds one per
-- model an admin switches to. Old drive_chunks vectors (1536-dim OpenAI) are dropped: they cannot serve another model.
CREATE TYPE "public"."document_kind" AS ENUM('drive', 'filing', 'web');--> statement-breakpoint
CREATE TABLE "documents" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" "public"."document_kind" NOT NULL,
  "external_id" text NOT NULL,
  "holding_id" uuid REFERENCES "public"."holdings"("id") ON DELETE set null,
  "ticker" text,
  "title" text NOT NULL,
  "url" text,
  "publisher" text,
  "published_at" timestamp with time zone,
  "doc_date" date,
  "form" text,
  "section_note" text,
  "version" text NOT NULL,
  "text" text,
  "text_for" text,
  "text_error" text,
  "summary" jsonb,
  "summary_model" text,
  "summary_version" smallint,
  "summary_for" text,
  "summary_error" text,
  "summarized_at" timestamp with time zone,
  "embed_model" text,
  "embed_for" text,
  "embed_error" text,
  "embedded_at" timestamp with time zone,
  "ingest_attempts" smallint DEFAULT 0 NOT NULL,
  "ingest_attempted_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "documents_kind_external" ON "documents" USING btree ("kind", "external_id");--> statement-breakpoint
CREATE INDEX "documents_holding" ON "documents" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "documents_ticker" ON "documents" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "documents_kind_published" ON "documents" USING btree ("kind", "published_at" DESC);--> statement-breakpoint
CREATE TABLE "document_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" text NOT NULL REFERENCES "public"."documents"("id") ON DELETE cascade,
  "holding_id" uuid REFERENCES "public"."holdings"("id") ON DELETE set null,
  "ticker" text,
  "seq" integer NOT NULL,
  "section" text,
  "text" text NOT NULL,
  "embedding" extensions.halfvec NOT NULL,
  "model" text NOT NULL,
  "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "document_chunks_document_seq" UNIQUE ("document_id", "seq")
);--> statement-breakpoint
CREATE INDEX "document_chunks_tsv" ON "document_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "document_chunks_holding" ON "document_chunks" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "document_chunks_ticker" ON "document_chunks" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "document_chunks_model" ON "document_chunks" USING btree ("model");--> statement-breakpoint
-- Every non-folder Drive file becomes a corpus row; text and summaries carry over when they were current for the file version.
INSERT INTO "documents" ("id", "kind", "external_id", "holding_id", "ticker", "title", "url", "publisher", "published_at", "doc_date", "version",
  "text", "text_for", "text_error", "summary", "summary_model", "summary_version", "summary_for", "summary_error", "summarized_at", "ingest_attempts", "ingest_attempted_at", "created_at")
SELECT f."id", 'drive', f."id", f."holding_id", f."ticker", f."name", f."web_view_link", 'Analyst Drive', f."modified_time", f."doc_date",
  coalesce(to_char(f."modified_time" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'unknown'),
  f."text",
  CASE WHEN f."text_modified_time" IS NOT NULL AND f."text_modified_time" = f."modified_time" THEN to_char(f."modified_time" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
  f."text_error",
  f."summary", f."summary_model", f."summary_version",
  CASE WHEN f."summary_modified_time" IS NOT NULL AND f."summary_modified_time" = f."modified_time" THEN to_char(f."modified_time" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
  f."summary_error", f."summarized_at", f."ingest_attempts", f."ingest_attempted_at", f."created_at"
FROM "drive_files" f WHERE f."is_folder" = false
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN "document_id" text REFERENCES "public"."documents"("id") ON DELETE set null;--> statement-breakpoint
UPDATE "drive_files" SET "document_id" = "id" WHERE "is_folder" = false;--> statement-breakpoint
DROP INDEX IF EXISTS "drive_files_ingest";--> statement-breakpoint
ALTER TABLE "drive_files"
  DROP COLUMN "text",
  DROP COLUMN "text_modified_time",
  DROP COLUMN "text_error",
  DROP COLUMN "summary",
  DROP COLUMN "summary_model",
  DROP COLUMN "summary_version",
  DROP COLUMN "summary_modified_time",
  DROP COLUMN "summary_error",
  DROP COLUMN "summarized_at",
  DROP COLUMN "doc_date",
  DROP COLUMN "embed_model",
  DROP COLUMN "embed_modified_time",
  DROP COLUMN "embed_error",
  DROP COLUMN "embedded_at",
  DROP COLUMN "ingest_attempts",
  DROP COLUMN "ingest_attempted_at";--> statement-breakpoint
DROP TABLE IF EXISTS "drive_chunks";--> statement-breakpoint
-- Agent memories share the embedding model; same typmod-less column and per-model partial index. Existing vectors
-- came from the old default model and stay usable only while that model is selected.
DROP INDEX IF EXISTS "agent_memories_embedding";--> statement-breakpoint
ALTER TABLE "agent_memories" ADD COLUMN "embed_model" text;--> statement-breakpoint
UPDATE "agent_memories" SET "embed_model" = 'openai/text-embedding-3-small' WHERE "embedding" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memories" ALTER COLUMN "embedding" TYPE extensions.halfvec USING "embedding"::extensions.halfvec;--> statement-breakpoint
CREATE INDEX "agent_memories_hnsw_openai_text_embedding_3_small" ON "agent_memories" USING hnsw (("embedding"::extensions.halfvec(1536)) extensions.halfvec_cosine_ops) WHERE "embed_model" = 'openai/text-embedding-3-small';--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Partial HNSW index for the default embedding model (Nemotron 3 Embed 1B, 2048 dims per NVIDIA's card).
CREATE INDEX "document_chunks_hnsw_nvidia_nemotron_3_embed_1b_free" ON "document_chunks" USING hnsw (("embedding"::extensions.halfvec(2048)) extensions.halfvec_cosine_ops) WHERE "model" = 'nvidia/nemotron-3-embed-1b:free';--> statement-breakpoint
CREATE INDEX "agent_memories_hnsw_nvidia_nemotron_3_embed_1b_free" ON "agent_memories" USING hnsw (("embedding"::extensions.halfvec(2048)) extensions.halfvec_cosine_ops) WHERE "embed_model" = 'nvidia/nemotron-3-embed-1b:free';
