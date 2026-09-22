import { getCurrentUser } from "@/lib/auth";
import { loadHootFeed } from "@/lib/hoot/nudges";

export const dynamic = "force-dynamic";

/** Hoot's nudges for the signed-in member. Fetched by the companion after the page is idle, never during render. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const feed = await loadHootFeed(user);
  return Response.json(feed, { headers: { "cache-control": "private, no-store" } });
}
