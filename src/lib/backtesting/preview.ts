/** Deterministic, explicitly synthetic data for local browser QA; never used by the real route. */
import { replay, type Price, type Snapshot } from "./engine";
import { snapshotPositions } from "./snapshot";
export const previewEnabled = () =>
  process.env.NODE_ENV === "development" &&
  process.env.BACKTESTING_PREVIEW === "1";
export const previewSnapshot: Snapshot = {
  ...snapshotPositions([
    { id: "00000000-0000-4000-8000-000000000001", ticker: "ALPHA", companyName: "Synthetic growth holding", weightPct: "60.00" },
    { id: "00000000-0000-4000-8000-000000000002", ticker: "BETA", companyName: "Synthetic newer holding", weightPct: "30.00" },
  ]),
  version: "0".repeat(64),
  scope: "Synthetic QA portfolio",
  capturedAt: "2026-08-31T20:00:00Z",
};
export function previewReplay(
  weights: Record<string, number>,
  benchmark: string,
  from: string,
  to: string,
) {
  const prices: Record<string, Price[]> = {
    ALPHA: [],
    BETA: [],
    SPY: [],
    QQQ: [],
    IWM: [],
  };
  const nav: Record<string, number> = Object.fromEntries(
    Object.keys(prices).map((k) => [k, 100]),
  );
  let i = 0;
  for (
    let t = Date.parse("2026-05-15");
    t <= Date.parse("2026-08-31");
    t += 86400000
  ) {
    const d = new Date(t),
      date = d.toISOString().slice(0, 10);
    if (
      [0, 6].includes(d.getUTCDay()) ||
      ["2026-05-25", "2026-06-19", "2026-07-03"].includes(date)
    )
      continue;
    for (const [j, symbol] of Object.keys(prices).entries()) {
      nav[symbol] *= 1 + Math.sin(i * 0.7 + j) * (0.009 + j * 0.001) + 0.0003;
      if (symbol !== "BETA" || date >= "2026-07-01")
        prices[symbol].push({ date, close: nav[symbol] });
    }
    i++;
  }
  if (from < "2026-06-01" || to > "2026-08-31")
    throw new Error(
      "Synthetic preview supports June 1 through August 31, 2026.",
    );
  return replay(
    previewSnapshot.positions,
    weights,
    prices,
    benchmark,
    from,
    to,
  );
}
