import type { Position, Snapshot } from "./engine";

export const MAX_SCENARIO_COMPANIES = 12;

export function normalizeScenarioTicker(value: string): string {
  const ticker = value.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker) || ticker === "CASH")
    throw new Error("Enter a valid company ticker, such as IBM.");
  return ticker;
}

export function addedPositionId(ticker: string): string {
  return `added:${ticker}`;
}

/** Added companies belong only to the modified scenario; the saved portfolio remains the original. */
export function withAddedCompanies(
  snapshot: Snapshot,
  companies: { ticker: string; name: string }[],
): Snapshot {
  if (companies.length > MAX_SCENARIO_COMPANIES)
    throw new Error(`Add at most ${MAX_SCENARIO_COMPANIES} companies to one scenario.`);
  const seen = new Set(snapshot.positions.map((p) => p.ticker.toUpperCase()));
  const additions: Position[] = companies.map((company) => {
    const ticker = normalizeScenarioTicker(company.ticker);
    if (seen.has(ticker))
      throw new Error(`${ticker} is already in this portfolio or scenario.`);
    seen.add(ticker);
    return {
      id: addedPositionId(ticker),
      ticker,
      name: company.name,
      weight: 0,
      kind: "scenario",
    };
  });
  return {
    ...snapshot,
    positions: [
      ...snapshot.positions.filter((p) => p.kind !== "cash"),
      ...additions,
      ...snapshot.positions.filter((p) => p.kind === "cash"),
    ],
  };
}
