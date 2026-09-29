import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";
import { claimJobLock, releaseJobLock } from "@/lib/jobs/lock";
import { createJobReporter } from "@/lib/jobs/progress";
import { todayNY } from "@/lib/providers/calendar";
import { buildWeeklyPack, type BuildResult } from "./build";
import { sendWeeklyEmail, type WeeklyEmailResult } from "./email";
import { getPack } from "./store";
import { lastFriday } from "./weeks";

const LOCK = "weekly";
const LOCK_STALE_MS = 10 * 60_000;

export type WeeklyJobResult = {
  status: "ok" | "skipped" | "failed";
  reason?: string;
  today: string;
  weekEnding: string;
  build?: BuildResult | { error: string };
  email?: WeeklyEmailResult | { error: string };
};

/**
 * The Sunday run: build the pack for the Friday that just passed, then email it to the exec who builds the deck. The
 * email goes out even when a build step failed: its Checks list says which part to fill in by hand. Once the week's email
 * has gone out the run does nothing (unless `resendEmail`), so the afternoon backstop can't change numbers Aadi already has.
 */
export async function runWeeklyJob(opts: { today?: string; resendEmail?: boolean; send?: boolean } = {}): Promise<WeeklyJobResult> {
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
    const emailed = (await getPack(weekEnding))?.sources?.email;
    if (emailed?.status === "ok" && !opts.resendEmail) {
      result.status = "skipped";
      result.reason = `the week's email already went out (${emailed.detail ?? emailed.at})`;
      return finish();
    }

    progress.step("build weekly pack", { weekEnding, today });
    try {
      result.build = await buildWeeklyPack(weekEnding, { reason: "weekly job", progress });
    } catch (e) {
      result.build = { error: e instanceof Error ? e.message : String(e) };
      result.status = "failed";
      progress.warn("build failed", { error: result.build.error });
    }

    if (opts.send === false) {
      progress.step("email skipped", { reason: "run without sending" });
      return finish();
    }
    progress.step("email the pack");
    try {
      result.email = await sendWeeklyEmail(weekEnding, { force: opts.resendEmail });
      if (result.email.status === "failed") {
        result.status = "failed";
        progress.warn("email failed", { error: result.email.reason });
      }
    } catch (e) {
      result.email = { error: e instanceof Error ? e.message : String(e) };
      result.status = "failed";
      progress.warn("email failed", { error: result.email.error });
    }
    return finish();
  } finally {
    await releaseJobLock(LOCK);
  }
}
