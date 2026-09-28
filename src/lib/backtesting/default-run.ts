import { DateTime } from "luxon";
import type { BacktestResult, Position, Snapshot } from "./engine";

// What Backtesting opens on when the link names no saved scenario, trade or dates: the portfolio at today's
// weights against SPY over the last year, already replayed, so the first view shows real results.

export const DEFAULT_BENCHMARK = "SPY" as const;
/** How far back the page's date fields start: one year before the last completed session. */
export const DEFAULT_LOOKBACK = { years: 1 } as const;

/** The default replay window ending on `end` (the last completed session, an ISO date). */
export function defaultWindow(end: string): { from: string; to: string } {
  return { from: DateTime.fromISO(end).minus(DEFAULT_LOOKBACK).toISODate()!, to: end };
}

/** Today's weights by position id, as the engine takes them (decimals, cash included). */
export function todaysWeights(positions: Position[]): Record<string, number> {
  return Object.fromEntries(positions.map((p) => [p.id, p.weight]));
}

/** The replay the page opens with: every holding at today's weight, against SPY, over the default window. */
export function defaultScenario(snapshot: Snapshot, end: string) {
  return { weights: todaysWeights(snapshot.positions), benchmark: DEFAULT_BENCHMARK, ...defaultWindow(end) };
}

/** True when a scenario is just today's portfolio: no companies added and every weight unchanged. */
export function isTodaysWeights(positions: Position[], weights: Record<string, number>): boolean {
  return positions.every((p) => p.kind !== "scenario" && Math.abs((weights[p.id] ?? Number.NaN) - p.weight) < 1e-8);
}

/** The opening replay, computed on the server while the page streams; an error leaves the user to run it. */
export type OpeningRun =
  | { result: BacktestResult; from: string; to: string; benchmark: typeof DEFAULT_BENCHMARK }
  | { error: string };
