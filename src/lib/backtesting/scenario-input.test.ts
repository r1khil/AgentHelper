import { describe, expect, it } from "vitest";
import { currentWeights, fitScenarioInput } from "./scenario-input";

const positions = [
  { id: "m", ticker: "META", name: "Meta", weight: 0.0398 },
  { id: "g", ticker: "GOOG", name: "Alphabet", weight: 0.048 },
  { id: "b", ticker: "BRK.B", name: "Berkshire", weight: 0.02 },
  { id: "x", ticker: "XOM", name: "Exxon", weight: 0.8722 },
  { id: "cash", ticker: "CASH", name: "Cash", weight: 0.02, kind: "cash" as const },
];

describe("fitScenarioInput", () => {
  it("reads another share class as the one held, and drops 'added' tickers that are held (the 2026-09-29 eval turn)", () => {
    const r = fitScenarioInput(positions, { weights: { META: 5, GOOGL: 3 }, addedTickers: ["GOOGL", "META"], trades: [{ ticker: "googl", changePp: 1, fundFrom: "BRK-A" }] });
    expect(r.weights).toEqual({ META: 5, GOOG: 3 });
    expect(r.addedTickers).toBeUndefined();
    expect(r.trades).toEqual([{ ticker: "GOOG", changePp: 1, fundFrom: "BRK.B" }]);
    expect(r.notes).toEqual([
      "GOOGL was read as GOOG, the share class the portfolio holds.",
      "BRK.A was read as BRK.B, the share class the portfolio holds.",
      "GOOGL is already held, so it was not added as a new company.",
      "META is already held, so it was not added as a new company.",
    ]);
  });

  it("leaves new companies, cash and funding keywords alone", () => {
    const r = fitScenarioInput(positions, { weights: { NVDA: 2, CASH: 0 }, addedTickers: ["NVDA"], trades: [{ ticker: "META", changePp: -1, fundFrom: "pro_rata" }] });
    expect(r).toEqual({ weights: { NVDA: 2, CASH: 0 }, addedTickers: ["NVDA"], trades: [{ ticker: "META", changePp: -1, fundFrom: "pro_rata" }], notes: [] });
  });
});

describe("currentWeights", () => {
  it("lists held weights in percent, largest first", () => {
    expect(currentWeights(positions).map((w) => `${w.ticker} ${w.weightPct}`)).toEqual(["XOM 87.22", "GOOG 4.8", "META 3.98", "BRK.B 2", "CASH 2"]);
  });
});
