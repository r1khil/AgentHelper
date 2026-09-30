import { authorizeCron } from "@/lib/jobs/auth";
import { screenCron } from "@/lib/screener/runs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * pg_cron calls this every ten minutes (drizzle/0028_screener.sql). It continues a screen in progress from
 * its checkpoint, starts one on the first Saturday of the month when the month has none, and otherwise returns
 * {status: "idle"} at once. It never sends email.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  // Leave a minute of the five for the database writes after the budget is spent.
  return Response.json(await screenCron({ budgetMs: 230_000 }));
}
