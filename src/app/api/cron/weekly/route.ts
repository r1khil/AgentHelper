import { authorizeCron } from "@/lib/jobs/auth";
import { runWeeklyJob } from "@/lib/weekly/job";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Sunday 09:00 New York (0 13 * * 0). `?date=` builds the pack for an earlier week. */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const today = new URL(req.url).searchParams.get("date") ?? undefined;
  const result = await runWeeklyJob({ today });
  return Response.json(result);
}
