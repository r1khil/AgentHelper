-- Agent memory (research log, learned facts, lessons), admin-configured MCP servers, earnings prep packs.
-- Hand-written (not journaled); apply with: npx tsx scripts/apply-sql.ts drizzle/0012_agent_memory.sql
CREATE TABLE "agent_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL CHECK ("scope" IN ('holding', 'team', 'fund')),
  "team_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade,
  "holding_id" uuid REFERENCES "public"."holdings"("id") ON DELETE cascade,
  "kind" text NOT NULL CHECK ("kind" IN ('log', 'fact', 'lesson')),
  "body" text NOT NULL,
  "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "meta" jsonb,
  "source_chat_id" uuid REFERENCES "public"."chats"("id") ON DELETE set null,
  "embedding" extensions.vector(1536),
  "model" text,
  "evidence_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "use_count" integer DEFAULT 0 NOT NULL,
  "created_by" text DEFAULT 'agent' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "agent_memories_holding" ON "agent_memories" USING btree ("holding_id", "kind", "created_at" DESC);--> statement-breakpoint
CREATE INDEX "agent_memories_team_scope" ON "agent_memories" USING btree ("team_id", "scope");--> statement-breakpoint
CREATE INDEX "agent_memories_embedding" ON "agent_memories" USING hnsw ("embedding" extensions.vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "agent_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_servers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL UNIQUE,
  "url" text NOT NULL,
  "auth_env" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "tool_prefix" text NOT NULL,
  "allowed_tools" text[],
  "last_ok_at" timestamp with time zone,
  "last_error" text,
  "tool_names" text[],
  "created_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "mcp_servers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "earnings"
  ADD COLUMN "prep_pack" jsonb,
  ADD COLUMN "prep_pack_at" timestamp with time zone,
  ADD COLUMN "prep_pack_model" text,
  ADD COLUMN "prep_pack_error" text;
