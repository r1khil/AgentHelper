import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cleanUsageEvent } from "@/lib/usage/events";
import { recordUsage } from "@/lib/usage/record";

/** More than a tab could queue between flushes; anything past it is dropped. */
const MAX_BATCH = 50;

/**
 * The browser tracker's batches (src/components/app/usage-tracker.tsx), sent with fetch or, as a tab closes,
 * navigator.sendBeacon. Always answers 204 so a bad batch never retries.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 204 });
  let body: { sessionId?: unknown; events?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 204 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : null;
  const events = (Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : []).flatMap((e) => {
    const clean = cleanUsageEvent(e);
    return clean ? [{ ...clean, sessionId }] : [];
  });
  after(() => recordUsage(user.id, events));
  return new Response(null, { status: 204 });
}
