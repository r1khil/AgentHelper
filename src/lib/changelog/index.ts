import "server-only";
import { unstable_cache } from "next/cache";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { changelogEntries } from "@/db/schema";
import { getBuildId } from "@/lib/build-id";
import { listMergedPulls, pullFiles, type MergedPull } from "./github";
import { FALLBACK_MODEL, summarizePull } from "./summarize";

export const CHANGELOG_TAG = "changelog";
const RETRY_AFTER_MS = 5 * 60 * 1000;

/**
 * GitHub is asked at most once per 15 minutes; Refresh on the page clears this. The key includes the
 * deployment id so the first view after a deploy always fetches fresh (the data cache outlives deployments).
 */
const cachedMergedPulls = unstable_cache(listMergedPulls, ["changelog-pulls", getBuildId()], { revalidate: 900, tags: [CHANGELOG_TAG] });

export type SyncResult = { added: number; pending: number; error: string | null };
export type Backlog = { missing: MergedPull[]; retry: MergedPull[]; error: string | null };

/** Returns false when the model call failed (the title is stored as a stand-in and retried later). */
async function writeEntry(pr: MergedPull): Promise<boolean> {
  const files = await pullFiles(pr.number).catch(() => []);
  const s = await summarizePull(pr, files);
  const row = { title: pr.title, author: pr.author, url: pr.url, mergedAt: new Date(pr.mergedAt), headline: s.headline, summary: s.summary, model: s.model, createdAt: new Date() };
  await db
    .insert(changelogEntries)
    .values({ prNumber: pr.number, ...row })
    .onConflictDoUpdate({ target: changelogEntries.prNumber, set: row });
  return !s.failed;
}

/**
 * Merged pull requests that still need a summary: ones the table does not have yet, and ones whose model call failed
 * earlier and are due for a retry. No model calls, so the page can await it.
 * `fresh` skips the 15-minute GitHub cache (Refresh button, scripts outside the Next runtime).
 */
export async function changelogBacklog({ fresh = false }: { fresh?: boolean } = {}): Promise<Backlog> {
  let pulls: MergedPull[];
  try {
    pulls = fresh ? await listMergedPulls() : await cachedMergedPulls();
  } catch (e) {
    return { missing: [], retry: [], error: e instanceof Error ? e.message : "GitHub request failed" };
  }
  const rows = await db.select({ n: changelogEntries.prNumber, model: changelogEntries.model, at: changelogEntries.createdAt }).from(changelogEntries);
  const known = new Map(rows.map((r) => [r.n, r]));
  // Entries whose model call failed keep the title as a stand-in; retry them after a pause (free-tier rate limits are short).
  const retryBefore = Date.now() - RETRY_AFTER_MS;
  const missing = pulls.filter((p) => !known.has(p.number));
  const retry = pulls.filter((p) => {
    const k = known.get(p.number);
    return k && k.model === FALLBACK_MODEL && k.at.getTime() < retryBefore;
  });
  return { missing, retry, error: null };
}

// One sync per instance at a time: overlapping page views would otherwise summarize the same pull requests twice
// and trip the free tier's per-minute limit.
let running: Promise<SyncResult> | null = null;

/**
 * Writes summaries for merged pull requests the table does not have yet, newest first.
 * Model calls take seconds each, so pages run this in `after()` rather than awaiting it.
 * `max` bounds the model calls made in one run; the rest follow on later runs.
 */
export function syncChangelog(opts: { max?: number; fresh?: boolean } = {}): Promise<SyncResult> {
  running ??= runSync(opts).finally(() => {
    running = null;
  });
  return running;
}

async function runSync({ max = 5, fresh = false }: { max?: number; fresh?: boolean }): Promise<SyncResult> {
  const { missing, retry, error } = await changelogBacklog({ fresh });
  if (error) return { added: 0, pending: 0, error };
  // Newest first across both lists: retries queued after all missing entries never ran while new merges kept arriving.
  const queue = [...missing, ...retry].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || b.number - a.number);
  let done = 0;
  for (const pr of queue.slice(0, max)) {
    done++;
    // A failure is almost always the free tier's per-minute limit; stop rather than burn the rest of the batch.
    if (!(await writeEntry(pr))) break;
  }
  return { added: done, pending: queue.length - done, error: null };
}

/** Rewrites one entry's summary (admin action for a wrong or fallback summary). */
export async function regenerateChangelogEntry(prNumber: number) {
  const pulls = await listMergedPulls();
  const pr = pulls.find((p) => p.number === prNumber);
  if (!pr) throw new Error(`PR #${prNumber} is not a merged pull request on main`);
  await writeEntry(pr);
}

export async function loadChangelog() {
  return db.select().from(changelogEntries).orderBy(desc(changelogEntries.mergedAt), desc(changelogEntries.prNumber)).limit(200);
}
