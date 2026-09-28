import { getCurrentUser } from "@/lib/auth";
import { liveScopeFor, loadLiveSnapshot } from "@/lib/attribution/live-load";

export const dynamic = "force-dynamic";

/** The Daily page's numbers, re-fetched every minute while the market is open. `?team=` for a team's sleeve. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const scope = await liveScopeFor(user, new URL(req.url).searchParams.get("team"));
  if (!scope) return new Response("Not found", { status: 404 });
  const snapshot = await loadLiveSnapshot(scope);
  if (!snapshot) return new Response("No attribution data", { status: 404 });
  return Response.json(snapshot, { headers: { "cache-control": "private, no-store" } });
}
