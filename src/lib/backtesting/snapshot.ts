import type { Position } from "./engine";

/** Current saved holding weights define the invested sleeve; never invent missing weights. */
export function snapshotPositions(
  rows: {
    id: string;
    ticker: string;
    companyName: string;
    weightPct: string | null;
  }[],
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
  if (total <= 0)
    throw new Error("The saved portfolio has no positive weights.");
  return {
    savedWeightTotal: total,
    positions: rows.map((r) => ({
      id: r.id,
      ticker: r.ticker,
      name: r.companyName,
      weight: Number(r.weightPct) / total,
    })),
  };
}
