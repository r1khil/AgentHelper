import type { JobProgressEvent } from "./progress-types";

export type { JobProgressEvent } from "./progress-types";

export type JobReporter = {
  step(name: string, detail?: Record<string, unknown>): void;
  item(name: string, n: number, of: number, detail?: Record<string, unknown>): void;
  warn(name: string, detail?: Record<string, unknown>): void;
  error(name: string, detail?: Record<string, unknown>): void;
  /** Write buffered events now. Never throws. */
  flush(): Promise<void>;
  /** Flush and stop the timer. Safe to call more than once. */
  close(): Promise<void>;
};

type Write = (events: JobProgressEvent[]) => Promise<void>;

/** Append in SQL so concurrent writers and page reloads never race a read-modify-write. */
async function appendToJobRun(jobRunId: string, events: JobProgressEvent[]) {
  const { db } = await import("@/db/client");
  const { jobRuns } = await import("@/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  await db
    .update(jobRuns)
    .set({ progress: sql`${jobRuns.progress} || ${JSON.stringify(events)}::jsonb` })
    .where(eq(jobRuns.id, jobRunId));
}

/**
 * Records a job's steps onto job_runs.progress while it runs, so the Admin page can show live
 * progress. Events are buffered and appended at most every `flushMs` or every `maxBuffer` events,
 * so a run costs a handful of small updates. Progress is best-effort: a failed write is dropped
 * and never fails the job.
 */
export function createJobReporter(jobRunId: string, opts: { flushMs?: number; maxBuffer?: number; write?: Write } = {}): JobReporter {
  const flushMs = opts.flushMs ?? 1000;
  const maxBuffer = opts.maxBuffer ?? 25;
  const write = opts.write ?? ((events) => appendToJobRun(jobRunId, events));
  let buffer: JobProgressEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let closed = false;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!buffer.length) return chain;
    const batch = buffer;
    buffer = [];
    chain = chain.then(() => write(batch)).catch(() => {});
    return chain;
  };
  const push = (e: JobProgressEvent) => {
    if (closed) return;
    buffer.push(e);
    if (buffer.length >= maxBuffer) void flush();
    else if (!timer) timer = setTimeout(() => void flush(), flushMs);
  };
  const now = () => new Date().toISOString();

  return {
    step: (name, detail) => push({ at: now(), kind: "step", name, ...(detail ? { detail } : {}) }),
    item: (name, n, of, detail) => push({ at: now(), kind: "item", name, n, of, ...(detail ? { detail } : {}) }),
    warn: (name, detail) => push({ at: now(), kind: "warn", name, ...(detail ? { detail } : {}) }),
    error: (name, detail) => push({ at: now(), kind: "error", name, ...(detail ? { detail } : {}) }),
    flush,
    close: async () => {
      await flush();
      closed = true;
    },
  };
}

/** A reporter that records nothing, for callers that have no job run row. */
export const noopReporter: JobReporter = {
  step: () => {},
  item: () => {},
  warn: () => {},
  error: () => {},
  flush: async () => {},
  close: async () => {},
};
