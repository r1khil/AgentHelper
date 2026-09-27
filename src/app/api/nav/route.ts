import { getCurrentUser } from "@/lib/auth";
import { marketSnapshot } from "@/lib/market";
import { loadNavData } from "@/lib/nav-data";

export const dynamic = "force-dynamic";

/**
 * The header's tab counts and the ⌘K holding list for a scope (`?scope=<team slug>|fund`), or one holding's
 * quote for the ⌘K preview (`?quote=NVDA`). Fetched by the shell after the page is idle.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const headers = { "cache-control": "private, no-store" };
  const quote = url.searchParams.get("quote");
  if (quote) {
    if (!/^[A-Z0-9.^-]{1,12}$/i.test(quote)) return new Response("Bad ticker", { status: 400 });
    const snap = await marketSnapshot([quote.toUpperCase()]);
    const row = snap.rows[quote.toUpperCase()];
    return Response.json({ price: row?.quote?.price ?? null, changePct: row?.quote?.changePct ?? null, relativePp: row?.relativePp ?? null }, { headers });
  }
  const scope = url.searchParams.get("scope") ?? "";
  if (!/^[\w-]{1,80}$/.test(scope)) return Response.json({ counts: {}, holdings: [] }, { headers });
  return Response.json(await loadNavData(user, scope), { headers });
}
