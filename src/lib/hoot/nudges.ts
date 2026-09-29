import "server-only";
import { listAccessibleTeams, type CurrentUser } from "@/lib/auth";
import { rememberedScope } from "@/lib/teams";
import { loadHootFeedFor } from "./feed";
import type { HootFeed } from "./types";

export { marketOpen } from "./feed";

/** What Hoot knows about right now for the signed-in member, with links in the scope they are in. */
export async function loadHootFeed(user: CurrentUser): Promise<HootFeed> {
  return loadHootFeedFor(user, { teams: await listAccessibleTeams(user), scope: await rememberedScope(user).catch(() => null) });
}
