import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";
import { embeddingModelId } from "@/lib/agent/retrieval-models";
import { embeddingStats } from "@/lib/documents/index";
import { listMcpServers } from "@/lib/agent/mcp";
import { agentConfigured } from "@/lib/agent/model";
import { embeddingConfigured } from "@/lib/agent/embeddings";
import { driveStatus } from "@/lib/drive/index";
import { emailConfigured } from "@/lib/jobs/notify";
import { FILINGS_LAST_SYNC_SETTING } from "@/lib/jobs/filings";
import { finnhubConfigured } from "@/lib/providers/finnhub";
import { getSetting } from "@/lib/settings";
import { tavilyConfigured } from "@/lib/web/tavily";
import { attentionCount, connectionRows, TRACKED_JOBS, type JobLastRun } from "@/components/app/admin/status";

async function lastRun(job: string) {
  const [r] = await db.select().from(jobRuns).where(eq(jobRuns.job, job)).orderBy(desc(jobRuns.startedAt)).limit(1);
  return r ?? null;
}

/**
 * What Admin needs to say about the scheduled jobs and outside services: each job's last run, every service's state,
 * and how many of them need a look (the count on the Jobs and connections tab, which every Admin tab shows).
 */
export async function loadAdminStatus() {
  const embedId = await embeddingModelId();
  const [drive, mcp, filingsLastSync, lastRuns, retrievalStats] = await Promise.all([
    driveStatus(),
    listMcpServers().catch(() => []),
    getSetting(FILINGS_LAST_SYNC_SETTING),
    Promise.all(TRACKED_JOBS.map(async (j) => [j, await lastRun(j)] as const)).then((e) => Object.fromEntries(e)),
    embeddingStats(embedId).catch(() => null),
  ]);
  const last: Record<string, JobLastRun | null> = Object.fromEntries(
    Object.entries(lastRuns).map(([job, r]) => [job, r ? { startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, ok: r.ok, summary: r.summary } : null]),
  );
  const lastDriveRun = lastRuns.drive_sync;
  const lastFilingsRun = lastRuns.filings_sync;
  const driveUnmatched = ((lastDriveRun?.summary as { unmatched?: string[] } | undefined)?.unmatched ?? []).slice(0, 12);
  const services = { agent: agentConfigured(), news: finnhubConfigured(), email: emailConfigured(), webSearch: tavilyConfigured() };
  const filings = { lastSync: filingsLastSync, lastRun: lastFilingsRun ? { ok: lastFilingsRun.ok, at: lastFilingsRun.startedAt.toISOString(), finishedAt: lastFilingsRun.finishedAt?.toISOString() ?? null } : null };
  const connections = connectionRows({
    drive,
    driveUnmatched,
    filings,
    services,
    retrieval: { configured: embeddingConfigured(), stats: retrievalStats },
    mcp: { total: mcp.length, enabled: mcp.filter((m) => m.enabled).length, failing: mcp.filter((m) => m.enabled && m.lastError).length, names: mcp.map((m) => m.name) },
  });
  return { last, drive, mcp, driveUnmatched, services, filings, retrievalStats, connections, attention: attentionCount(last, connections) };
}
