import { beforeEach, expect, it, vi } from "vitest";
const { chart } = vi.hoisted(() => ({ chart: vi.fn() }));
vi.mock("yahoo-finance2", () => ({
  default: class {
    chart = chart;
  },
}));
vi.mock("@/lib/providers/limiter", () => ({
  spaced: (_host: string, _gap: number, fn: () => unknown) => fn(),
  retry: (fn: () => unknown) => fn(),
}));
import { getAdjustedBarsRange } from "@/lib/providers/yahoo";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "");
});
it("uses adjusted rather than raw close, normalizes NY dates, and caches identical requests", async () => {
  chart.mockResolvedValue({
    meta: { currency: "USD" },
    quotes: [
      { date: new Date("2025-02-04T00:30:00Z"), close: 110, adjclose: 100 },
      { date: new Date("2025-02-04T21:00:00Z"), close: 109, adjclose: 101 },
    ],
  });
  const first = await getAdjustedBarsRange(
    "ADJUSTED_TEST",
    "2025-02-03",
    "2025-02-04",
  );
  const cached = await getAdjustedBarsRange(
    "ADJUSTED_TEST",
    "2025-02-03",
    "2025-02-04",
  );
  expect(first).toEqual([
    { date: "2025-02-03", close: 100 },
    { date: "2025-02-04", close: 101 },
  ]);
  expect(cached).toEqual(first);
  expect(chart).toHaveBeenCalledTimes(1);
});
it("drops null rows rather than silently switching to raw close", async () => {
  chart.mockResolvedValue({
    meta: { currency: "USD" },
    quotes: [
      { date: new Date("2025-01-02T21:00:00Z"), close: 100 },
      { date: new Date("2025-01-03T21:00:00Z"), close: 101, adjclose: 99 },
    ],
  });
  expect(
    await getAdjustedBarsRange("MISSING_TEST", "2025-01-01", "2025-01-03"),
  ).toEqual([{ date: "2025-01-03", close: 99 }]);
});
it("rejects unusable adjusted prices", async () => {
  chart.mockResolvedValue({
    meta: { currency: "USD" },
    quotes: [{ date: new Date(), close: 100, adjclose: 0 }],
  });
  await expect(
    getAdjustedBarsRange("INVALID_TEST", "2025-01-01", "2025-01-02"),
  ).rejects.toThrow(/Invalid adjusted/);
});
it("rejects non-USD history without an FX return series", async () => {
  chart.mockResolvedValue({ meta: { currency: "EUR" }, quotes: [] });
  await expect(
    getAdjustedBarsRange("CURRENCY_TEST", "2025-01-01", "2025-01-02"),
  ).rejects.toThrow(/USD/);
});
it("treats a confirmed prelisting Yahoo no-data error as no bars", async () => {
  chart.mockRejectedValueOnce(new Error("Data doesn't exist for startDate = 1, endDate = 2"));
  chart.mockResolvedValueOnce({
    meta: { currency: "USD", firstTradeDate: new Date("2024-03-21T13:30:00Z") },
    quotes: [{ date: new Date("2026-09-01T20:00:00Z"), adjclose: 100 }],
  });
  expect(await getAdjustedBarsRange("PRELISTING_TEST", "2023-06-01", "2023-06-30")).toEqual([]);
  expect(chart).toHaveBeenCalledTimes(2);
});
it("does not hide a no-data error when the stock traded during the requested range", async () => {
  chart.mockRejectedValueOnce(new Error("Data doesn't exist for startDate = 1, endDate = 2"));
  chart.mockResolvedValueOnce({
    meta: { currency: "USD", firstTradeDate: new Date("2020-01-01T13:30:00Z") },
    quotes: [{ date: new Date("2026-09-01T20:00:00Z"), adjclose: 100 }],
  });
  await expect(getAdjustedBarsRange("GAPPED_TEST", "2023-06-01", "2023-06-30")).rejects.toThrow(/Data doesn't exist/);
});
