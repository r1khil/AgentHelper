import { authorizeCron } from "@/lib/jobs/auth";
import { sendDailyBrief } from "@/lib/jobs/daily-brief";
import { briefRetrySkipReason } from "@/lib/jobs/schedule";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Retry of the 5:15 p.m. brief email: Supabase pg_cron calls this every 15 minutes across both of New York's UTC
 * offsets, and a Vercel cron once as a backstop. It acts from 5:25 p.m. until midnight New York time and returns
 * at once when today's brief already went out.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const early = briefRetrySkipReason();
  if (early) return Response.json({ status: "skipped", reason: early });
  return Response.json(await sendDailyBrief({ scheduled: true }));
}
