import { authorizeCron } from "@/lib/jobs/auth";
import { runDailyBriefAnalysis } from "@/lib/jobs/daily-brief";
import { slotSkipResponse } from "@/lib/jobs/schedule";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 5:05 p.m. New York (Supabase pg_cron, `?at=17:05`): Hoot analyzes the day's attribution. `?date=` redoes an earlier session. */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const skip = slotSkipResponse(req);
  if (skip) return skip;
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  return Response.json(await runDailyBriefAnalysis({ sessionDate: date }));
}
