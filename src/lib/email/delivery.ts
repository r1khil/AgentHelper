import { createHash } from "node:crypto";

/**
 * A request that failed. `retryable` means repeating the same request shortly may work (no response, a 5xx,
 * a burst limit); `retryAfterMs` is the provider's own wait when it gave one.
 */
export class DeliveryError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  constructor(message: string, opts: { retryable: boolean; retryAfterMs?: number | null }) {
    super(message);
    this.name = "DeliveryError";
    this.retryable = opts.retryable;
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }
}

/** Statuses worth repeating: a timeout, a rate limit, or the server (or the proxy in front of it) failing. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Retry-After as milliseconds, from seconds or an HTTP date. Null when missing or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Call `send` until it succeeds, waiting `delaysMs[i]` before try i + 2. Stops at an error that is not
 * retryable, or whose Retry-After is longer than `maxWaitMs` (a daily quota, say), since waiting inside one
 * request would not help. Throws the last error, with `tries` set on it.
 */
export async function withRetries<T>(
  send: () => Promise<T>,
  opts: { delaysMs: number[]; maxWaitMs?: number; wait?: (ms: number) => Promise<void> },
): Promise<{ value: T; tries: number }> {
  const wait = opts.wait ?? sleep;
  const maxWaitMs = opts.maxWaitMs ?? 30_000;
  for (let tries = 1; ; tries++) {
    try {
      return { value: await send(), tries };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const delay = opts.delaysMs[tries - 1];
      if (!(error instanceof DeliveryError) || !error.retryable || delay === undefined) throw Object.assign(error, { tries });
      const waitMs = Math.max(error.retryAfterMs ?? 0, delay);
      if (waitMs > maxWaitMs) throw Object.assign(error, { tries });
      await wait(waitMs);
    }
  }
}

/** The same input always gives the same UUID-shaped key (for OpenMail's Idempotency-Key). */
export function stableKey(input: unknown): string {
  const h = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
