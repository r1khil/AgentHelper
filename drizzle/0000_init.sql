CREATE TYPE "public"."account_kind" AS ENUM('google', 'password');--> statement-breakpoint
CREATE TYPE "public"."date_status" AS ENUM('confirmed', 'estimated');--> statement-breakpoint
CREATE TYPE "public"."earnings_status" AS ENUM('upcoming', 'reported', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('news', 'filing', 'peer_move', 'price', 'financial', 'release');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "public"."holding_status" AS ENUM('active', 'exited');--> statement-breakpoint
CREATE TYPE "public"."movement_status" AS ENUM('open', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('movement_alert', 'reminder', 'overdue', 'earnings');--> statement-breakpoint
CREATE TYPE "public"."period_type" AS ENUM('quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'approved', 'rejected', 'exception');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('associate_analyst', 'lead_analyst', 'exec', 'admin');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'ok', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"holding_id" uuid,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_closes" (
	"ticker" text NOT NULL,
	"session_date" date NOT NULL,
	"close" numeric(18, 6) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_closes_ticker_session_date_pk" PRIMARY KEY("ticker","session_date")
);
--> statement-breakpoint
CREATE TABLE "earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holding_id" uuid NOT NULL,
	"fiscal_period" text,
	"report_date" date NOT NULL,
	"report_hour" text,
	"date_status" date_status DEFAULT 'estimated' NOT NULL,
	"date_source_url" text,
	"eps_estimate" numeric(12, 4),
	"revenue_estimate" numeric(20, 2),
	"expectations" text,
	"key_questions" text,
	"thesis_change_criteria" text,
	"pre_locked_at" timestamp with time zone,
	"actuals" jsonb,
	"gathered_at" timestamp with time zone,
	"reflection" text,
	"reflection_by" uuid,
	"reflection_at" timestamp with time zone,
	"status" "earnings_status" DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid,
	"earnings_id" uuid,
	"kind" "evidence_kind" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"publisher" text,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holding_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"company_name" text NOT NULL,
	"cik" text,
	"owner_id" uuid,
	"thesis" text,
	"thesis_updated_at" timestamp with time zone,
	"status" "holding_status" DEFAULT 'active' NOT NULL,
	"added_at" date DEFAULT now() NOT NULL,
	"exited_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "role" DEFAULT 'associate_analyst' NOT NULL,
	"team_id" uuid,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"sheet" text NOT NULL,
	"row_ref" integer NOT NULL,
	"label_in_model" text NOT NULL,
	"concept" text NOT NULL,
	"taxonomy" text DEFAULT 'us-gaap' NOT NULL,
	"unit" text DEFAULT 'USD' NOT NULL,
	"scale" integer DEFAULT 1 NOT NULL,
	"sign" integer DEFAULT 1 NOT NULL,
	"period_type" "period_type" DEFAULT 'quarterly' NOT NULL,
	"period_columns" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"anchor_column" text,
	"rationale" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"mapping_id" uuid NOT NULL,
	"period_end" date NOT NULL,
	"cell_ref" text NOT NULL,
	"value" numeric(24, 6),
	"unit" text,
	"reported_label" text,
	"fiscal_period" text,
	"source_url" text,
	"accession" text,
	"filed_at" date,
	"derivation" text,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"exception_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_writes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"from_version" integer NOT NULL,
	"to_version" integer NOT NULL,
	"proposal_ids" uuid[] NOT NULL,
	"written_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holding_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"sheets" jsonb,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement_runs" (
	"session_date" date PRIMARY KEY NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holding_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"holding_return_pct" numeric(10, 4),
	"spx_return_pct" numeric(10, 4),
	"relative_move_pp" numeric(10, 4),
	"status" "movement_status" DEFAULT 'open' NOT NULL,
	"owner_id" uuid,
	"due_at" timestamp with time zone,
	"evidence_status" "evidence_status" DEFAULT 'pending' NOT NULL,
	"data_quality" text,
	"update_text" text,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"recipient_id" uuid,
	"recipient_email" text NOT NULL,
	"ref_id" uuid,
	"dedupe_key" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"full_name" text NOT NULL,
	"role" "role" DEFAULT 'associate_analyst' NOT NULL,
	"kind" "account_kind" DEFAULT 'google' NOT NULL,
	"team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email"),
	CONSTRAINT "profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_reflection_by_profiles_id_fk" FOREIGN KEY ("reflection_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_earnings_id_earnings_id_fk" FOREIGN KEY ("earnings_id") REFERENCES "public"."earnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_notes" ADD CONSTRAINT "holding_notes_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_notes" ADD CONSTRAINT "holding_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_mappings" ADD CONSTRAINT "model_mappings_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_mappings" ADD CONSTRAINT "model_mappings_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_proposals" ADD CONSTRAINT "model_proposals_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_proposals" ADD CONSTRAINT "model_proposals_mapping_id_model_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."model_mappings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_proposals" ADD CONSTRAINT "model_proposals_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_writes" ADD CONSTRAINT "model_writes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_writes" ADD CONSTRAINT "model_writes_written_by_profiles_id_fk" FOREIGN KEY ("written_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_completed_by_profiles_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_chat_seq" ON "chat_messages" USING btree ("chat_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "earnings_holding_report" ON "earnings" USING btree ("holding_id","report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_team_ticker_active" ON "holdings" USING btree ("team_id","ticker") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "models_holding_version" ON "models" USING btree ("holding_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "movements_holding_session" ON "movements" USING btree ("holding_id","session_date");