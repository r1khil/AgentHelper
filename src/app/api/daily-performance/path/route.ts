import { getCurrentUser } from "@/lib/auth";
import { liveScopeFor, loadLivePath, loadLiveSnapshot } from "@/lib/attribution/live-load";

export const dynamic = "force-dynamic";

/** The session so far in five-minute steps, for the Daily page's chart. Loaded after the page, since the first fetch of the day takes seconds. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const scope = await liveScopeFor(user, new URL(req.url).searchParams.get("team"));
  if (!scope) return new Response("Not found", { status: 404 });
  const snapshot = await loadLiveSnapshot(scope);
  if (!snapshot) return new Response("No attribution data", { status: 404 });
  const points = await loadLivePath(snapshot);
  return Response.json({ session: snapshot.session, points }, { headers: { "cache-control": "private, no-store" } });
}
