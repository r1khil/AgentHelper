import { authorizeCron } from "@/lib/jobs/auth";
import { sendDailyBrief } from "@/lib/jobs/daily-brief";
import { DAILY_BRIEF_RECIPIENTS } from "@/lib/jobs/daily-brief-format";
import { slotSkipResponse } from "@/lib/jobs/schedule";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * 5:15 p.m. New York (Supabase pg_cron, `?at=17:15`): email Hoot's brief to the execs and admins. When it fails,
 * /api/cron/daily-brief/retry tries again every 15 minutes until midnight. Once per session unless `?force=1`.
 * `?to=a@x,b@y` sends a copy to people on the list only; it does not count as the list's email.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const skip = slotSkipResponse(req);
  if (skip) return skip;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;
  const to = (url.searchParams.get("to") ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const listed = new Set(DAILY_BRIEF_RECIPIENTS.map((r) => r.email));
  const strangers = to.filter((a) => !listed.has(a));
  if (strangers.length) return Response.json({ status: "failed", reason: `not on the brief's list: ${strangers.join(", ")}` }, { status: 400 });
  return Response.json(
    await sendDailyBrief({ sessionDate: date, force: url.searchParams.get("force") === "1", scheduled: url.searchParams.has("at"), to: to.length ? to : undefined }),
  );
}
