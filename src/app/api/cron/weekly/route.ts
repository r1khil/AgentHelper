import { authorizeCron } from "@/lib/jobs/auth";
import { slotSkipResponse } from "@/lib/jobs/schedule";
import { runWeeklyJob } from "@/lib/weekly/job";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Sunday 12:00 New York (Supabase pg_cron, `?at=12:00`): build last Friday's pack and email it to Aadi. The Vercel cron is
 * a mid-afternoon backstop; once the week's email has gone out, later calls change nothing. `?date=` builds an earlier week.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const skip = slotSkipResponse(req);
  if (skip) return skip;
  const today = new URL(req.url).searchParams.get("date") ?? undefined;
  const result = await runWeeklyJob({ today });
  return Response.json(result);
}
