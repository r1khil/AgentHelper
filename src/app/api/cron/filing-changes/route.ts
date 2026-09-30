import { authorizeCron } from "@/lib/jobs/auth";
import { todayNY } from "@/lib/providers/calendar";
import { runFilingChangesJob } from "@/lib/screener/filing-changes/job";
import { runPitchChecks } from "@/lib/screener/pitches";
import { getSetting, setSetting } from "@/lib/settings";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PITCH_CHECKS_SETTING = "pitch_checks_date";

/**
 * pg_cron calls this every 10 minutes through the evening; each call works for about four minutes and saves its place.
 * Once the night's filings are done, the pitches' kill criteria are checked against them (once a night).
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const result = await runFilingChangesJob({ budgetMs: 240_000, reason: "cron" });
  let pitches: Awaited<ReturnType<typeof runPitchChecks>> | "done today" | null = null;
  if (result.status === "idle" || (result.status === "ok" && result.remaining === 0)) {
    const today = todayNY();
    if ((await getSetting(PITCH_CHECKS_SETTING, { fresh: true })) !== today) {
      pitches = await runPitchChecks().catch((e: unknown) => {
        console.error("[pitches] kill-criteria checks failed:", e);
        return null;
      });
      if (pitches) await setSetting(PITCH_CHECKS_SETTING, today, null);
    } else pitches = "done today";
  }
  return Response.json({ ...result, pitches });
}
