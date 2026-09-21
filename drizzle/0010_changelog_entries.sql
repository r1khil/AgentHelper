CREATE TABLE "changelog_entries" (
	"pr_number" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"url" text NOT NULL,
	"merged_at" timestamp with time zone NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "changelog_entries" ENABLE ROW LEVEL SECURITY;
