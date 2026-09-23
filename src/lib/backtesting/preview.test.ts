import { afterEach, expect, it, vi } from "vitest";
import { previewEnabled, previewReplay, previewSnapshot } from "./preview";
afterEach(() => vi.unstubAllEnvs());
it("disables synthetic preview outside an explicitly opted-in development runtime", () => {
  for (const env of ["production", "test"] as const) {
    vi.stubEnv("NODE_ENV", env);
    vi.stubEnv("BACKTESTING_PREVIEW", "1");
    expect(previewEnabled()).toBe(false);
  }
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("BACKTESTING_PREVIEW", "");
  expect(previewEnabled()).toBe(false);
  vi.stubEnv("BACKTESTING_PREVIEW", "1");
  expect(previewEnabled()).toBe(true);
});
it("previews uninvested cash and a holding that starts trading during the range", () => {
  expect(previewSnapshot.savedWeightTotal).toBe(90);
  expect(previewSnapshot.positions.at(-1)?.ticker).toBe("CASH");
  expect(previewSnapshot.positions.at(-1)?.weight).toBeCloseTo(0.1, 12);
  const weights = Object.fromEntries(previewSnapshot.positions.map((p) => [p.id, p.weight]));
  const result = previewReplay(weights, "SPY", "2026-06-01", "2026-07-10");
  expect(result.cashSubstitutions).toEqual([{ ticker: "BETA", through: "2026-07-01" }]);
});
