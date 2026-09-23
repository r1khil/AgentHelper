import type { Position } from "./engine";

/** Current saved holding weights and their unallocated remainder define the portfolio. */
export const CASH_ID = "00000000-0000-4000-8000-000000000000";
export function snapshotPositions(
  rows: {
    id: string;
    ticker: string;
    companyName: string;
    weightPct: string | null;
  }[],
  // A team's rows carry fund-level weights, so its sleeve is normalized to 100% with no cash.
  { sleeve = false }: { sleeve?: boolean } = {},
): { positions: Position[]; savedWeightTotal: number } {
  if (!rows.length)
    throw new Error(
      "No active holdings. Add holdings and record their position sizes first.",
    );
  const missing = rows.filter(
    (r) =>
      r.weightPct === null ||
      r.weightPct.trim() === "" ||
      !Number.isFinite(Number(r.weightPct)) ||
      Number(r.weightPct) < 0,
  );
  if (missing.length)
    throw new Error(
      `Saved weights are missing or invalid for ${missing.map((r) => r.ticker).join(", ")}. Update position sizes before backtesting.`,
    );
  const total = rows.reduce((s, r) => s + Number(r.weightPct), 0);
  if (total > 100 + 1e-8)
    throw new Error("Saved holding weights exceed 100%. Fix the current portfolio before backtesting.");
  if (sleeve && total <= 0)
    throw new Error("The saved portfolio has no positive weights.");
  const base = sleeve ? total : 100;
  return {
    savedWeightTotal: total,
    positions: [
      ...rows.map((r) => ({
        id: r.id,
        ticker: r.ticker,
        name: r.companyName,
        weight: Number(r.weightPct) / base,
      })),
      {
        id: CASH_ID,
        ticker: "CASH",
        name: "Uninvested cash · 0% return",
        weight: sleeve ? 0 : Math.max(0, (100 - total) / 100),
        kind: "cash" as const,
      },
    ],
  };
}
