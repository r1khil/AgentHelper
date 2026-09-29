-- A general Hoot conversation an exec or admin starts outside any team's view belongs to the whole Fund: no team.
-- Holding chats always keep the holding's team.
ALTER TABLE "chats" ALTER COLUMN "team_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_fund_wide_general_only" CHECK ("team_id" IS NOT NULL OR "holding_id" IS NULL);
