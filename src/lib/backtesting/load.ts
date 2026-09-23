import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { holdings } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { isFundWide } from "@/lib/roles";
import { getAdjustedBarsRange, resolveCompany } from "@/lib/providers/yahoo";
import { NY } from "@/lib/providers/calendar";
import { snapshotPositions } from "./snapshot";
import {
  MAX_SCENARIO_COMPANIES,
  normalizeScenarioTicker,
  withAddedCompanies,
} from "./scenario";
import {
  BENCHMARKS,
  replay,
  validateRange,
  validateWeights,
  type Snapshot,
} from "./engine";

export async function loadSnapshot(user: CurrentUser): Promise<Snapshot> {
  if (!isFundWide(user) && !user.teamId)
    throw new Error("Join a team before backtesting its portfolio.");
  const held = await db
    .select({
      id: holdings.id,
      ticker: holdings.ticker,
      companyName: holdings.companyName,
      weightPct: holdings.weightPct,
    })
    .from(holdings)
    .where(
      and(
        eq(holdings.status, "active"),
        isFundWide(user) ? undefined : eq(holdings.teamId, user.teamId!),
      ),
    )
    .orderBy(asc(holdings.id))
    .catch((error: unknown) => {
      console.error("[backtesting] holdings query failed", error);
      throw new Error(
        "Unable to read current portfolio weights. Please retry.",
      );
    });
  // weight_pct is the fund-level weight copied onto every active row for a ticker, so a stock two teams
  // both cover appears twice in the fund-wide query; keep one row per ticker before deriving cash.
  const rows = isFundWide(user)
    ? held.filter((r, i) => held.findIndex((o) => o.ticker === r.ticker) === i)
    : held;
  const snapshot = snapshotPositions(rows, { sleeve: !isFundWide(user) });
  return {
    ...snapshot,
    version: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    capturedAt: new Date().toISOString(),
    scope: isFundWide(user)
      ? "Fund portfolio"
      : `${user.team?.name ?? "Team"} portfolio`,
  };
}

/** Resolve user-added symbols again on the server before replaying a scenario. */
export async function resolveScenarioSnapshot(
  snapshot: Snapshot,
  addedTickers: string[],
): Promise<Snapshot> {
  if (addedTickers.length > MAX_SCENARIO_COMPANIES)
    throw new Error(`Add at most ${MAX_SCENARIO_COMPANIES} companies to one scenario.`);
  const tickers = addedTickers.map(normalizeScenarioTicker);
  if (new Set(tickers).size !== tickers.length)
    throw new Error("Each added ticker may appear only once.");
  const existing = new Set(snapshot.positions.map((p) => p.ticker.toUpperCase()));
  for (const ticker of tickers)
    if (existing.has(ticker))
      throw new Error(`${ticker} is already in the saved portfolio.`);
  const companies = await Promise.all(tickers.map(async (ticker) => {
    let company;
    try {
      company = await resolveCompany(ticker);
    } catch {
      throw new Error(`The market data provider is unavailable for ${ticker}. Please retry.`);
    }
    if (!company)
      throw new Error(`Could not recognize ${ticker} with the market data provider.`);
    return { ticker: normalizeScenarioTicker(company.symbol), name: company.name };
  }));
  return withAddedCompanies(snapshot, companies);
}
export async function runBacktest(
  snapshot: Snapshot,
  weights: Record<string, number>,
  benchmark: keyof typeof BENCHMARKS,
  from: string,
  to: string,
) {
  validateRange(from, to);
  if (to > DateTime.now().setZone(NY).minus({ days: 1 }).toISODate()!)
    throw new Error(
      "Use an end date before today so only completed sessions are included.",
    );
  validateWeights(snapshot.positions, weights);
  const symbols = [
    ...new Set([
      benchmark,
      ...snapshot.positions
        .filter((p) => p.kind !== "cash" && (p.weight > 0 || weights[p.id] > 0))
        .map((p) => p.ticker),
    ]),
  ];
  const start = DateTime.fromISO(from).minus({ days: 14 }).toISODate()!;
  // Bound provider concurrency; all-or-nothing coverage is checked by replay.
  const prices: Record<
    string,
    Awaited<ReturnType<typeof getAdjustedBarsRange>>
  > = {};
  for (let i = 0; i < symbols.length; i += 4) {
    await Promise.all(
      symbols.slice(i, i + 4).map(async (symbol) => {
        try {
          prices[symbol] = await getAdjustedBarsRange(symbol, start, to);
        } catch {
          throw new Error(
            `Adjusted history unavailable for ${symbol}. Try again or choose another date range.`,
          );
        }
      }),
    );
  }
  return replay(snapshot.positions, weights, prices, benchmark, from, to);
}
