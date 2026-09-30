import { getVercelOidcToken } from "@vercel/oidc";
import { getCurrentUser } from "@/lib/auth";
import { agentBackupModelId, agentConfigured, agentModelId } from "@/lib/agent/model";
import { isFallbackStatus } from "@/lib/agent/fallback";
import { allowStep, takeoverRequest, TAKEOVER_MAX_BODY } from "@/lib/hoot/takeover-llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
/** A step normally answers in 2–4 s; one stalled past this is cut off and retried rather than waited out. */
const STEP_TIMEOUT_MS = 12_000;
/** Each member's recent steps, per server instance: enough to stop a loop from spending the gateway credit. */
const steps = new Map<string, number[]>();

/**
 * page-agent's model endpoint (its baseURL is /api/hoot/page-agent) for when Hoot takes over the screen to open a page.
 * Signed-in members only; the call runs on Hoot's own gateway model (the backup when the primary is rate-limited or
 * down), so no key reaches the browser.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  if (!allowStep(steps, user.id)) return Response.json({ error: { message: "Too many takeover steps; try again in a minute." } }, { status: 429 });
  if (!agentConfigured()) return Response.json({ error: { message: "The AI Gateway is not configured." } }, { status: 503 });

  const text = await req.text();
  if (text.length > TAKEOVER_MAX_BODY) return Response.json({ error: { message: "Request too large." } }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: { message: "Expected a JSON body." } }, { status: 400 });
  }

  const token = process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken());
  const call = async (model: string) => {
    const r = takeoverRequest(json, model);
    if ("error" in r) return Response.json({ error: { message: r.error } }, { status: 400 });
    try {
      return await fetch(GATEWAY, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(r.body),
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(STEP_TIMEOUT_MS)]),
      });
    } catch (e) {
      if (req.signal.aborted) throw e;
      // A stalled step: page-agent retries a 5xx once, which usually comes back in a couple of seconds.
      return Response.json({ error: { message: "The model took too long." } }, { status: 504, headers: { "x-takeover-stall": "1" } });
    }
  };

  let res = await call(await agentModelId());
  // A stall goes back to page-agent to retry on the primary; the backup is slower still.
  if (!res.ok && isFallbackStatus(res.status) && !res.headers.has("x-takeover-stall")) {
    await res.body?.cancel();
    console.warn(`[hoot takeover] primary model failed (${res.status}); trying the backup`);
    res = await call(await agentBackupModelId());
  }
  return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
}
