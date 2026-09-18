import { currentTrace } from "@/lib/trace/context";

/** Minimal per-host spacing so we never exceed a provider's request rate. */
const last = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

export function spaced<T>(host: string, minIntervalMs: number, fn: () => Promise<T>): Promise<T> {
  const trace = currentTrace();
  const prev = queues.get(host) ?? Promise.resolve();
  const run = prev.then(async () => {
    const wait = (last.get(host) ?? 0) + minIntervalMs - Date.now();
    if (wait > 0) {
      trace?.emit({ t: "wait", host, ms: wait });
      await new Promise((r) => setTimeout(r, wait));
    }
    last.set(host, Date.now());
  });
  queues.set(host, run.catch(() => {}));
  return run.then(fn);
}

export async function retry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  const trace = currentTrace();
  let err: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      const backoffMs = baseMs * 2 ** i;
      if (i + 1 < attempts) trace?.emit({ t: "retry", attempt: i + 1, backoffMs, error: e instanceof Error ? e.message : String(e) });
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw err;
}
