import { describe, expect, it } from "vitest";
import { validateRange, validateWeights } from "./engine";
import { defaultScenario, defaultWindow, isTodaysWeights, todaysWeights } from "./default-run";
import { previewSnapshot } from "./preview";
import { snapshotPositions } from "./snapshot";
import { addedPositionId, withAddedCompanies } from "./scenario";

describe("defaultWindow", () => {
  it("starts one year before the last completed session", () => {
    expect(defaultWindow("2026-09-25")).toEqual({ from: "2025-09-25", to: "2026-09-25" });
  });
  it("clamps a leap day to the same month a year back", () => {
    expect(defaultWindow("2028-02-29")).toEqual({ from: "2027-02-28", to: "2028-02-29" });
  });
  it("is a range the engine accepts", () => {
    const { from, to } = defaultWindow("2026-09-25");
    expect(() => validateRange(from, to)).not.toThrow();
  });
});

describe("defaultScenario", () => {
  it("replays every holding and cash at today's weight against SPY", () => {
    const s = defaultScenario(previewSnapshot, "2026-08-31");
    expect(s).toMatchObject({ benchmark: "SPY", from: "2025-08-31", to: "2026-08-31" });
    expect(Object.keys(s.weights)).toEqual(previewSnapshot.positions.map((p) => p.id));
    expect(Object.values(s.weights)).toEqual([0.6, 0.3, expect.closeTo(0.1, 12)]);
    expect(() => validateWeights(previewSnapshot.positions, s.weights)).not.toThrow();
  });
  it("keeps a team sleeve's rescaled weights, with no cash", () => {
    const sleeve = {
      ...snapshotPositions(
        [
          { id: "a", ticker: "A", companyName: "A", weightPct: "3" },
          { id: "b", ticker: "B", companyName: "B", weightPct: "1" },
        ],
        { sleeve: true },
      ),
      version: "v",
      scope: "Team portfolio",
      capturedAt: "t",
    };
    const s = defaultScenario(sleeve, "2026-09-25");
    expect(s.weights).toMatchObject({ a: 0.75, b: 0.25 });
    expect(Object.values(s.weights).at(-1)).toBe(0);
    expect(() => validateWeights(sleeve.positions, s.weights)).not.toThrow();
  });
});

describe("isTodaysWeights", () => {
  const positions = previewSnapshot.positions;
  it("is true for today's weights, including float noise", () => {
    expect(isTodaysWeights(positions, todaysWeights(positions))).toBe(true);
    const noisy = Object.fromEntries(positions.map((p) => [p.id, p.weight + 1e-12]));
    expect(isTodaysWeights(positions, noisy)).toBe(true);
  });
  it("is false once a weight changes or is missing", () => {
    const [a, b] = positions;
    expect(isTodaysWeights(positions, { ...todaysWeights(positions), [a.id]: a.weight - 0.01, [b.id]: b.weight + 0.01 })).toBe(false);
    const missing = todaysWeights(positions);
    delete missing[a.id];
    expect(isTodaysWeights(positions, missing)).toBe(false);
  });
  it("is false when a company was added, even at 0%", () => {
    const added = withAddedCompanies(previewSnapshot, [{ ticker: "GAMMA", name: "Gamma" }]).positions;
    const weights = todaysWeights(added);
    expect(weights[addedPositionId("GAMMA")]).toBe(0);
    expect(isTodaysWeights(added, weights)).toBe(false);
  });
});
