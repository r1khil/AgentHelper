ALTER TABLE "profiles" ADD COLUMN "boundary_acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Existing members were set up by hand; do not send them through first-sign-in setup.
UPDATE "profiles" SET "onboarded_at" = now(), "boundary_acknowledged_at" = now() WHERE "onboarded_at" IS NULL;
