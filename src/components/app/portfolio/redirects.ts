// Client-safe: the old Portfolio pages (Attribution, the ledger, Risk, Exposure, Backtesting) redirect to the views that
// replaced them, keeping the query that still means the same thing there (period, lookback, tab, trade, scenario).

type Query = Record<string, string | string[] | undefined>;

/** `path` with the query carried over, every value kept (a repeated key stays repeated). */
export function withQuery(path: string, query: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string") qs.append(k, v);
    else if (Array.isArray(v)) for (const x of v) qs.append(k, x);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
