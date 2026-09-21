import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getEconomicCalendar } from "./service";

const range = { from: "2026-09-21", to: "2026-09-27" };
const row = {
  CalendarId: "test",
  Country: "United States",
  Event: "Test release",
  Date: "2026-09-24T12:30:00",
  DateSpan: "0",
  Actual: "9",
  Forecast: "2",
  Previous: "1",
  Reference: "Aug",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("coalesces, caches, expires and separates configuration using the real cache", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
  vi.stubEnv("TRADING_ECONOMICS_API_KEY", "service-test-one");
  vi.stubEnv("EODHD_API_KEY", "");
  vi.stubEnv("DATABASE_URL", "");
  const fetcher = vi.fn(async () => Response.json([row]));
  vi.stubGlobal("fetch", fetcher);
  const feeds = await Promise.all([
    getEconomicCalendar(range),
    getEconomicCalendar(range),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(feeds[0]).toEqual(feeds[1]);
  expect(feeds[0]).toMatchObject({
    provider: "Trading Economics",
    events: [{ actual: null, estimate: "2", previous: "1", period: "Aug" }],
  });
  await getEconomicCalendar(range);
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date("2026-09-21T12:01:01Z"));
  await getEconomicCalendar(range);
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.stubEnv("TRADING_ECONOMICS_API_KEY", "service-test-two");
  await getEconomicCalendar(range);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("clears failed pending requests so a later refresh can recover", async () => {
  vi.stubEnv("TRADING_ECONOMICS_API_KEY", "service-recovery-test");
  vi.stubEnv("EODHD_API_KEY", "");
  vi.stubEnv("DATABASE_URL", "");
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(Response.json([row]));
  vi.stubGlobal("fetch", fetcher);
  await expect(getEconomicCalendar(range)).rejects.toThrow("unavailable");
  await expect(getEconomicCalendar(range)).resolves.toMatchObject({
    provider: "Trading Economics",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
