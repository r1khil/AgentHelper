/**
 * Embedding providers cap the tokens per input, and chunks are cut by characters: a numeric-dense table can tokenize
 * to three tokens per character. When the endpoint rejects a batch with its measured length, shrink the inputs by
 * that ratio and try again rather than recording the document as unembeddable. Pure module, no network.
 */
export type TokenLimit = { length: number; max: number };

/** Parse a provider's "input length 4533 exceeds model maximum 4096" message (NVIDIA NIM wording via OpenRouter). */
export function parseTokenLimit(message: string): TokenLimit | null {
  const m = message.match(/input length (\d+) exceeds model maximum (\d+)/i);
  if (!m) return null;
  const length = Number(m[1]);
  const max = Number(m[2]);
  return length > max && max > 0 ? { length, max } : null;
}

/** Cut every input in the batch by the reported ratio with a 10% margin; the error does not say which input was long. */
export function shrinkInputs(inputs: string[], limit: TokenLimit): string[] {
  const ratio = Math.min(0.9, (limit.max / limit.length) * 0.9);
  return inputs.map((s) => s.slice(0, Math.max(1, Math.floor(s.length * ratio))));
}
