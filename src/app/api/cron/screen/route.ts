import { authorizeCron } from "@/lib/jobs/auth";
import { agentConfigured } from "@/lib/agent/model";
import { latestScreen, screenCron } from "@/lib/screener/runs";
import { writePendingTearSheets } from "@/lib/screener/tear-sheets";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * pg_cron calls this every ten minutes (drizzle/0028_screener.sql). It continues a screen in progress from
 * its checkpoint, starts one on the first Saturday of the month when the month has none, and otherwise writes the
 * latest run's missing tear sheets (each team's top five) until none are left. It never sends email.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  // Leave a minute of the five for the database writes after the budget is spent.
  const result = await screenCron({ budgetMs: 230_000 });
  if (result.status !== "idle" || !agentConfigured()) return Response.json(result);
  const screen = await latestScreen();
  const sheets = screen ? await writePendingTearSheets(screen.hits, 230_000) : null;
  return Response.json({ ...result, sheets });
}
