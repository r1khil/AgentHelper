import { authorizeCron } from "@/lib/jobs/auth";
import { sendDailyBrief } from "@/lib/jobs/daily-brief";
import { slotSkipResponse } from "@/lib/jobs/schedule";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * 5:15 p.m. New York (Supabase pg_cron, `?at=17:15`), retried at 00:05 UTC after OpenMail's quotas reset:
 * email Hoot's brief to the execs and admins. Once per session unless `?force=1`.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const skip = slotSkipResponse(req);
  if (skip) return skip;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;
  return Response.json(await sendDailyBrief({ sessionDate: date, force: url.searchParams.get("force") === "1" }));
}
