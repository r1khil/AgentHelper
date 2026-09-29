import "server-only";
import { listAccessibleTeams, type CurrentUser } from "@/lib/auth";
import { rememberedScope } from "@/lib/teams";
import { loadHootFeedFor } from "./feed";
import type { HootFeed } from "./types";

/** The signed-in member's feed: their teams, with links in the scope they were last in. */
export async function loadHootFeed(user: CurrentUser): Promise<HootFeed> {
  return loadHootFeedFor(user, { teamList: await listAccessibleTeams(user), scope: await rememberedScope(user).catch(() => null) });
}
