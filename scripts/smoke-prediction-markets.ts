// Exercise get_market_odds against the live Kalshi and Polymarket APIs without a model. Both are public, so no env
// is loaded, and the provider cache stays in memory (no DATABASE_URL, nothing written to the database).
// Usage: npx tsx --conditions=react-server scripts/smoke-prediction-markets.ts ["query" ...]
import { makePredictionMarketTools } from "@/lib/agent/prediction-markets-tools";
import type { ToolResult } from "@/lib/agent/tools";
import type { PredictionMarket } from "@/lib/providers/prediction-markets";

delete process.env.DATABASE_URL;

async function main() {
  const queries = process.argv.length > 2 ? process.argv.slice(2) : ["fed rate cut", "CPI", "recession", "government shutdown"];
  const tools = makePredictionMarketTools();
  const execute = tools.get_market_odds.execute as (i: unknown, o: unknown) => Promise<ToolResult<unknown>>;
  for (const query of queries) {
    const t0 = Date.now();
    const r = await execute({ query, venue: "both", limit: 4 }, { toolCallId: "smoke", messages: [] });
    const d = r.data as { markets: (PredictionMarket & { sourceId: string })[]; dropped: unknown; unavailable?: unknown } | null;
    console.log(`\n== ${query} — ${Date.now() - t0} ms, ${r.sources.length} sources${r.error ? `, ERROR ${r.error}` : ""}`);
    if (!d) continue;
    console.log(`  dropped ${JSON.stringify(d.dropped)}${d.unavailable ? ` unavailable ${JSON.stringify(d.unavailable)}` : ""}`);
    for (const m of d.markets) {
      const head = m.impliedMedian ? `median ${m.impliedMedian}` : m.likeliest ? `likeliest ${m.likeliest.label} ${m.likeliest.probabilityPct}%` : "";
      console.log(`  [${m.venue}] ${m.title} (${m.kind}, closes ${m.closes?.slice(0, 10)}, vol ${m.volume} ${m.volumeUnit}) ${head}`);
      for (const o of m.outcomes.slice(0, 4)) console.log(`      ${o.label}: ${o.probabilityPct}% ±${o.spreadPct / 2} (vol ${o.volume})`);
      console.log(`      ${m.url} ${m.sourceId}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
