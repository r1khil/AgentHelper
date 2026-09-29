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
  const teCalls = () =>
    fetcher.mock.calls.filter((c) =>
      String((c as unknown[])[0]).includes("api.tradingeconomics.com"),
    ).length;
  const feeds = await Promise.all([
    getEconomicCalendar(range),
    getEconomicCalendar(range),
  ]);
  expect(teCalls()).toBe(1);
  expect(feeds[0]).toEqual(feeds[1]);
  expect(feeds[0]).toMatchObject({
    provider: "Trading Economics",
    events: [{ actual: null, estimate: "2", previous: "1", period: "Aug" }],
  });
  await getEconomicCalendar(range);
  expect(teCalls()).toBe(1);
  vi.setSystemTime(new Date("2026-09-21T12:01:01Z"));
  await getEconomicCalendar(range);
  expect(teCalls()).toBe(2);
  vi.stubEnv("TRADING_ECONOMICS_API_KEY", "service-test-two");
  await getEconomicCalendar(range);
  expect(teCalls()).toBe(3);
});
/** Trading Economics answers while `up.value` is true; every other source is always down. */
function teOnly(up: { value: boolean }) {
  return vi.fn(async (input: string | URL | Request) => {
    if (up.value && String(input).includes("api.tradingeconomics.com"))
      return Response.json([row]);
    throw new Error("offline");
  });
}
it("clears failed pending requests so a later refresh can recover", async () => {
  vi.stubEnv("TRADING_ECONOMICS_API_KEY", "service-recovery-test");
  vi.stubEnv("EODHD_API_KEY", "");
  vi.stubEnv("DATABASE_URL", "");
  const up = { value: false };
  vi.stubGlobal("fetch", teOnly(up));
  const later = { from: "2026-10-05", to: "2026-10-11" };
  await expect(getEconomicCalendar(later)).rejects.toThrow("unavailable");
  up.value = true;
  await expect(getEconomicCalendar(later)).resolves.toMatchObject({
    provider: "Trading Economics",
  });
});
it("serves the last good copy, labeled, when every source fails", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  vi.stubEnv("TRADING_ECONOMICS_API_KEY", "service-stale-test");
  vi.stubEnv("EODHD_API_KEY", "");
  vi.stubEnv("DATABASE_URL", "");
  const up = { value: true };
  const fetcher = teOnly(up);
  vi.stubGlobal("fetch", fetcher);
  const week = { from: "2026-10-12", to: "2026-10-18" };
  const fresh = await getEconomicCalendar(week);
  expect(fresh.stale).toBeUndefined();

  up.value = false;
  vi.setSystemTime(new Date("2026-09-28T12:01:01Z"));
  const stale = await getEconomicCalendar(week);
  expect(stale).toMatchObject({
    stale: true,
    provider: "Trading Economics",
    fetchedAt: fresh.fetchedAt,
    events: fresh.events,
    coverage: { status: "partial" },
  });
  expect(stale.coverage?.message).toContain("Mon, Sep 28, 8:00 AM ET");
  expect(stale.sources?.map((s) => [s.name, s.status])).toEqual([
    ["Trading Economics", "unavailable"],
    ["TradingView", "unavailable"],
    ["biquote (free)", "unavailable"],
    ["Public agency feeds", "unavailable"],
  ]);

  // Polls within the retry window get the stale copy without rerunning the chain.
  const calls = fetcher.mock.calls.length;
  vi.setSystemTime(new Date("2026-09-28T12:01:20Z"));
  await getEconomicCalendar(week);
  expect(fetcher.mock.calls.length).toBe(calls);

  up.value = true;
  vi.setSystemTime(new Date("2026-09-28T12:01:40Z"));
  const recovered = await getEconomicCalendar(week);
  expect(recovered.stale).toBeUndefined();
  expect(recovered.fetchedAt).not.toBe(fresh.fetchedAt);
});
