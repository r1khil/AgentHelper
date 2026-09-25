// Exercise get_macro_series against the live FRED API without a model: shortcuts, a transform,
// aggregation of a daily series, a search that returns candidates, and an unknown id.
// Needs FRED_API_KEY in .env.local (or the environment).
// Usage: npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/smoke-fred.ts [SERIES_OR_SHORTCUT]
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
// Scripts never write the shared provider cache.
delete process.env.DATABASE_URL;
import { makeFredTools } from "@/lib/agent/fred-tools";
import { fredConfigured } from "@/lib/providers/fred";
import type { ToolResult } from "@/lib/agent/tools";

async function main() {
  if (!fredConfigured()) {
    console.log("FRED_API_KEY is not set; get_macro_series is not registered. Add the key to .env.local and rerun.");
    return;
  }
  const tool = makeFredTools().get_macro_series;
  const run = async (input: Record<string, unknown>) => {
    const t0 = Date.now();
    const r = (await (tool.execute as (i: unknown, o: unknown) => Promise<ToolResult<Record<string, unknown> | null>>)({ transform: "level", aggregation: "average", ...input }, { toolCallId: "smoke" })) as ToolResult<Record<string, unknown> | null>;
    const d = r.data;
    console.log(`\n== ${JSON.stringify(input)} — ${Date.now() - t0} ms, ${r.sources.length} sources${r.error ? `, ERROR ${r.error}` : ""}`);
    if (!d) return;
    if (d.candidates) {
      for (const c of d.candidates as Record<string, unknown>[]) console.log(`  ${c.seriesId} · ${c.title} · ${c.frequency} ${c.seasonalAdjustment} · pop ${c.popularity}${c.discontinued ? " · DISCONTINUED" : ""}`);
      return;
    }
    const obs = (d.observations as [string, number][]) ?? [];
    console.log(`  ${d.seriesId} ${d.title}\n  ${d.units} · ${d.frequency} · ${d.seasonalAdjustment} · updated ${d.lastUpdated}`);
    console.log(`  latest ${JSON.stringify(d.latest)} previous ${JSON.stringify(d.previous)} high ${JSON.stringify(d.high)} low ${JSON.stringify(d.low)}`);
    console.log(`  ${obs.length} of ${d.observationCount} points shown: ${obs.slice(-3).map(([dt, v]) => `${dt}=${v}`).join(", ")}`);
    if (d.seriesNote) console.log(`  seriesNote: ${d.seriesNote}`);
    console.log(`  note: ${d.note}`);
    console.log(`  source: ${r.sources[0]?.id} ${r.sources[0]?.title} ${r.sources[0]?.url}`);
  };
  const only = process.argv[2];
  if (only) return void (await run({ seriesId: only }));
  await run({ seriesId: "10y" });
  await run({ seriesId: "2s10s", start: "2022-01-01", frequency: "monthly", aggregation: "end_of_period" });
  await run({ seriesId: "core cpi", transform: "yoy" });
  await run({ seriesId: "hy spread" });
  await run({ seriesId: "UNRATE", transform: "change" });
  await run({ query: "housing starts" });
  await run({ seriesId: "NOTASERIES123" });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
