import { authorizeCron } from "@/lib/jobs/auth";
import { slotSkipResponse } from "@/lib/jobs/schedule";
import { runCloseJob } from "@/lib/jobs/close";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 5:00 p.m. New York (Supabase pg_cron, `?at=17:00`); the Vercel cron is a later backstop. */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const skip = slotSkipResponse(req);
  if (skip) return skip;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;
  const force = url.searchParams.get("force") === "1";
  const result = await runCloseJob({ sessionDate: date, force });
  return Response.json(result);
}
