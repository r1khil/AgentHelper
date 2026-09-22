import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";
import { claimJobLock, releaseJobLock } from "@/lib/jobs/lock";
import { createJobReporter } from "@/lib/jobs/progress";
import { todayNY } from "@/lib/providers/calendar";
import { sendProcessUpdateAsks, type AskResult } from "./ask";
import { buildWeeklyPack, type BuildResult } from "./build";
import { lastFriday } from "./weeks";

const LOCK = "weekly";
const LOCK_STALE_MS = 10 * 60_000;

export type WeeklyJobResult = {
  status: "ok" | "skipped" | "failed";
  reason?: string;
  today: string;
  weekEnding: string;
  build?: BuildResult | { error: string };
  asks?: AskResult | { error: string };
};

/**
 * The Sunday run: build the pack for the Friday that just passed, then ask the execs for their
 * process updates for the coming week. Both halves are independent, so one failing still leaves
 * the other's work in place.
 */
export async function runWeeklyJob(opts: { today?: string; resendAsks?: boolean } = {}): Promise<WeeklyJobResult> {
  const today = opts.today || todayNY();
  const weekEnding = lastFriday(today);
  const [jobRow] = await db.insert(jobRuns).values({ job: "weekly" }).returning({ id: jobRuns.id });
  const progress = createJobReporter(jobRow.id);
  const result: WeeklyJobResult = { status: "ok", today, weekEnding };

  const finish = async () => {
    progress.step("finished", { weekEnding, status: result.status });
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: result.status !== "failed", summary: result as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
    return result;
  };

  if (!(await claimJobLock(LOCK, LOCK_STALE_MS))) {
    result.status = "skipped";
    result.reason = "another weekly run is in progress";
    return finish();
  }

  try {
    progress.step("build weekly pack", { weekEnding, today });
    try {
      result.build = await buildWeeklyPack(weekEnding, { reason: "weekly job", progress });
    } catch (e) {
      result.build = { error: e instanceof Error ? e.message : String(e) };
      result.status = "failed";
      progress.warn("build failed", { error: result.build.error });
    }

    progress.step("send process-update asks");
    try {
      result.asks = await sendProcessUpdateAsks(weekEnding, { resend: opts.resendAsks });
    } catch (e) {
      result.asks = { error: e instanceof Error ? e.message : String(e) };
      result.status = "failed";
      progress.warn("asks failed", { error: result.asks.error });
    }
    return finish();
  } finally {
    await releaseJobLock(LOCK);
  }
}
