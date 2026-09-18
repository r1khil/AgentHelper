CREATE TYPE "public"."drive_doc_kind" AS ENUM('initiating_coverage', 'earnings_update', 'model', 'other');--> statement-breakpoint
CREATE TABLE "drive_connection" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"account_email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scopes" text[] NOT NULL,
	"root_folder_id" text,
	"root_folder_name" text,
	"connected_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone,
	"sync_started_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_connection_single" CHECK ("id" = 1)
);--> statement-breakpoint
CREATE TABLE "drive_files" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"parent_id" text,
	"path" text NOT NULL,
	"is_folder" boolean DEFAULT false NOT NULL,
	"size" bigint,
	"modified_time" timestamp with time zone,
	"web_view_link" text,
	"md5" text,
	"ticker" text,
	"holding_id" uuid REFERENCES "public"."holdings"("id") ON DELETE set null,
	"kind" "drive_doc_kind",
	"created_by_app" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid REFERENCES "public"."profiles"("id") ON DELETE set null,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text" text,
	"text_modified_time" timestamp with time zone,
	"text_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "drive_files_holding" ON "drive_files" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "drive_files_parent" ON "drive_files" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "drive_files_ticker" ON "drive_files" USING btree ("ticker");--> statement-breakpoint
ALTER TABLE "drive_connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drive_files" ENABLE ROW LEVEL SECURITY;
