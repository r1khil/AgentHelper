import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";
import { getCurrentUser, isFundWide, transparencyEnabled } from "@/lib/auth";
import type { JobProgressEvent } from "@/lib/jobs/progress-types";

export const dynamic = "force-dynamic";

export type JobRunView = {
  id: string;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  summary: Record<string, unknown>;
  /** Latest step, always. */
  current: JobProgressEvent | null;
  /** Full step log, transparency mode only. */
  progress: JobProgressEvent[] | null;
};

/** Recent job runs for the Admin page poller. Execs and admins; the full step log needs transparency mode. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isFundWide(user)) return new Response("Unauthorized", { status: 401 });
  const rows = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(12);
  const detail = transparencyEnabled(user);
  const runs: JobRunView[] = rows.map((r) => ({
    id: r.id,
    job: r.job,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    ok: r.ok,
    summary: r.summary,
    current: r.progress.at(-1) ?? null,
    progress: detail ? r.progress : null,
  }));
  return Response.json({ runs }, { headers: { "cache-control": "private, no-store" } });
}
