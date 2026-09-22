import { afterEach, expect, it, vi } from "vitest";
import { previewEnabled } from "./preview";
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
