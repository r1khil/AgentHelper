import { APICallError, type LanguageModelV4 } from "@ai-sdk/provider";

export type FallbackEvent = { from: string; to: string; error: string };

/** An HTTP status worth trying on the next model. 402: out of gateway credits for a paid model; a free backup still answers. */
export const isFallbackStatus = (s: number) => s === 429 || s === 408 || s === 404 || s === 402 || s >= 500;

/**
 * Rate limits, upstream outages, dropped connections and a model that no longer exists are worth trying on the next
 * model; bad requests are not. A withdrawn free variant answers 404 (Ling's on OpenRouter, 2026-09-28).
 */
export function isFallbackError(e: unknown): boolean {
  if (APICallError.isInstance(e)) {
    const s = e.statusCode;
    if (s !== undefined) return isFallbackStatus(s);
    return e.isRetryable;
  }
  if (e instanceof TypeError && /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(e.message)) return true;
  return false;
}

/**
 * A language model that tries `ids` in order. The first id is the primary; when its request fails
 * before any output arrives with a rate limit or server error, the same call is retried on the next
 * id. Once a stream has started it is never switched, so a partial answer never mixes two models.
 * `make` builds a model for an id and is called lazily, once per id.
 */
export function withModelFallback(ids: string[], make: (id: string) => LanguageModelV4, onFallback?: (e: FallbackEvent) => void): LanguageModelV4 {
  const order = [...new Set(ids.filter(Boolean))];
  if (order.length === 0) throw new Error("withModelFallback needs at least one model id");
  const models = new Map<string, LanguageModelV4>();
  const get = (id: string) => {
    let m = models.get(id);
    if (!m) {
      m = make(id);
      models.set(id, m);
    }
    return m;
  };
  const primary = get(order[0]);
  if (order.length === 1) return primary;

  async function attempt<T>(run: (m: LanguageModelV4) => PromiseLike<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < order.length; i++) {
      try {
        return await run(get(order[i]));
      } catch (e) {
        last = e;
        if (i === order.length - 1 || !isFallbackError(e)) throw e;
        onFallback?.({ from: order[i], to: order[i + 1], error: e instanceof Error ? e.message : String(e) });
      }
    }
    throw last;
  }

  return {
    specificationVersion: "v4",
    provider: primary.provider,
    modelId: primary.modelId,
    get supportedUrls() {
      return primary.supportedUrls;
    },
    doGenerate: (options) => attempt((m) => m.doGenerate(options)),
    doStream: (options) => attempt((m) => m.doStream(options)),
  };
}
