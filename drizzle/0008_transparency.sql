-- Transparency mode: an exec/admin preference that reveals how the agent, attribution and jobs work.
-- job_runs.progress collects step events while a job runs so the Admin page can show live progress.
ALTER TABLE "profiles" ADD COLUMN "transparency_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "progress" jsonb DEFAULT '[]'::jsonb NOT NULL;
