import { authorizeCron } from "@/lib/jobs/auth";
import { slotSkipResponse } from "@/lib/jobs/schedule";
import { runPricesJob } from "@/lib/jobs/prices";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 5:00 p.m. New York (Supabase pg_cron, `?at=17:00`); the Vercel cron is a later backstop. */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const skip = slotSkipResponse(req);
  if (skip) return skip;
  return Response.json(await runPricesJob());
}
