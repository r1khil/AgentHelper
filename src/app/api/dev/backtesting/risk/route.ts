import { z } from "zod";
import { previewEnabled, previewSnapshot } from "@/lib/backtesting/preview";
import { withAddedCompanies } from "@/lib/backtesting/scenario";
import { compareScenario } from "@/lib/risk/compare";
import { previewWindow } from "@/lib/risk/preview";

const schema = z.object({ weights: z.record(z.string().min(1).max(64), z.number()), addedTickers: z.array(z.string()).default([]) });

/** Synthetic risk comparison for the local Backtesting preview; no live portfolio data. */
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  const { weights, addedTickers } = schema.parse(await request.json());
  const snapshot = withAddedCompanies(previewSnapshot, addedTickers.map((t) => ({ ticker: t, name: "Synthetic former holding" })));
  const tickers = snapshot.positions.filter((p) => p.kind !== "cash").map((p) => p.ticker);
  const { window, sectorOf } = previewWindow(tickers, 252);
  return Response.json(
    compareScenario({ positions: snapshot.positions, weights, sectorOf, window, benchmarkWeights: { information_technology: 0.6, health_care: 0.4 }, riskFree: null, scope: "fund", asOf: window.dates.at(-1)!, lookback: "1y", benchmarkLabel: "S&P 500 sectors" }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
