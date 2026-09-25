import { createHash } from "node:crypto";

export type ProviderName = "OpenMail" | "Gmail" | "Resend";

/** One provider's part in a delivery: how many requests it made and, when it failed, why. */
export type ProviderAttempt = { provider: ProviderName; ok: boolean; tries: number; error?: string };

/** A provider to try, whose `send` reports how many requests it took. */
export type ProviderSend<T> = { name: ProviderName; send: () => Promise<{ value: T; tries: number }> };

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

/** Every provider failed; `attempts` says how each one did. */
export class EmailNotSentError extends Error {
  readonly attempts: ProviderAttempt[];
  constructor(attempts: ProviderAttempt[]) {
    super(attempts.length ? attempts.map((a) => `${a.provider}: ${a.error}`).join("; ") : "email is not configured");
    this.name = "EmailNotSentError";
    this.attempts = attempts;
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

/** Deliver through the first provider that works, in order, keeping every provider's outcome. */
export async function sendWithFailover<T>(providers: ProviderSend<T>[]): Promise<{ provider: ProviderName; value: T; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];
  for (const p of providers) {
    try {
      const { value, tries } = await p.send();
      attempts.push({ provider: p.name, ok: true, tries });
      return { provider: p.name, value, attempts };
    } catch (e) {
      attempts.push({ provider: p.name, ok: false, tries: (e as { tries?: number }).tries ?? 1, error: e instanceof Error ? e.message : String(e) });
    }
  }
  throw new EmailNotSentError(attempts);
}

/** The same input always gives the same UUID-shaped key (for OpenMail's Idempotency-Key). */
export function stableKey(input: unknown): string {
  const h = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
