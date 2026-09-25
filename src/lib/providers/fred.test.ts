import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No per-host spacing in tests; retry stays real so the 429 path is exercised.
vi.mock("./limiter", async (original) => ({ ...(await original<object>()), spaced: (_h: string, _ms: number, fn: () => Promise<unknown>) => fn() }));

import { downsample, getObservations, getSeriesInfo, observationStats, parseValue, searchSeries } from "./fred";

const KEY = "abcdefghijklmnopqrstuvwxyz123456";

// Shapes as FRED API v1 returns them (file_type=json), trimmed.
const DGS10 = {
  id: "DGS10",
  realtime_start: "2026-09-25",
  realtime_end: "2026-09-25",
  title: "Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity, Quoted on an Investment Basis",
  observation_start: "1962-01-02",
  observation_end: "2026-09-24",
  frequency: "Daily",
  frequency_short: "D",
  units: "Percent",
  units_short: "%",
  seasonal_adjustment: "Not Seasonally Adjusted",
  seasonal_adjustment_short: "NSA",
  last_updated: "2026-09-25 15:17:02-05",
  popularity: 95,
  notes: "For further information regarding treasury constant maturity data, please refer to the H.15 Statistical Release notes.",
};
const observations = {
  realtime_start: "2026-09-25",
  realtime_end: "2026-09-25",
  observation_start: "2026-08-28",
  observation_end: "2026-09-08",
  units: "lin",
  output_type: 1,
  file_type: "json",
  order_by: "observation_date",
  sort_order: "asc",
  count: 6,
  offset: 0,
  limit: 100000,
  observations: [
    { realtime_start: "2026-09-25", realtime_end: "2026-09-25", date: "2026-08-28", value: "4.21" },
    { realtime_start: "2026-09-25", realtime_end: "2026-09-25", date: "2026-08-31", value: "4.23" },
    { realtime_start: "2026-09-25", realtime_end: "2026-09-25", date: "2026-09-01", value: "4.18" },
    { realtime_start: "2026-09-25", realtime_end: "2026-09-25", date: "2026-09-07", value: "." },
    { realtime_start: "2026-09-25", realtime_end: "2026-09-25", date: "2026-09-08", value: "4.09" },
  ],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("FRED_API_KEY", KEY);
  vi.stubEnv("DATABASE_URL", "");
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const calledUrl = (i = 0) => new URL(String(fetchMock.mock.calls[i][0]));

describe("FRED provider", () => {
  it("reads observations with the transform and aggregation, turns '.' into null, and caches", async () => {
    fetchMock.mockResolvedValueOnce(json(observations));
    const r = await getObservations("dgs10", { start: "2026-08-28", end: "2026-09-08", units: "pc1", frequency: "m", aggregation: "eop" });
    expect(r.observations).toEqual([
      { date: "2026-08-28", value: 4.21 },
      { date: "2026-08-31", value: 4.23 },
      { date: "2026-09-01", value: 4.18 },
      { date: "2026-09-07", value: null },
      { date: "2026-09-08", value: 4.09 },
    ]);
    expect(r).toMatchObject({ seriesId: "DGS10", units: "pc1", frequency: "m", aggregation: "eop" });
    const u = calledUrl();
    expect(u.origin + u.pathname).toBe("https://api.stlouisfed.org/fred/series/observations");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ api_key: KEY, file_type: "json", series_id: "DGS10", observation_start: "2026-08-28", observation_end: "2026-09-08", units: "pc1", frequency: "m", aggregation_method: "eop" });

    await getObservations("DGS10", { start: "2026-08-28", end: "2026-09-08", units: "pc1", frequency: "m", aggregation: "eop" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves out frequency and aggregation unless asked", async () => {
    fetchMock.mockResolvedValueOnce(json(observations));
    await getObservations("UNRATE", { start: "2021-01-01", end: "2026-09-25" });
    const params = calledUrl().searchParams;
    expect(params.get("units")).toBe("lin");
    expect(params.has("frequency")).toBe(false);
    expect(params.has("aggregation_method")).toBe(false);
  });

  it("maps series metadata", async () => {
    fetchMock.mockResolvedValueOnce(json({ realtime_start: "2026-09-25", realtime_end: "2026-09-25", seriess: [DGS10] }));
    const s = await getSeriesInfo("DGS10");
    expect(s).toMatchObject({ id: "DGS10", frequency: "Daily", frequencyShort: "D", units: "Percent", seasonalAdjustmentShort: "NSA", lastUpdated: "2026-09-25 15:17:02-05", observationEnd: "2026-09-24", popularity: 95 });
    expect(calledUrl().pathname).toBe("/fred/series");
  });

  it("answers an unknown series with null, once, without retrying", async () => {
    fetchMock.mockResolvedValueOnce(json({ error_code: 400, error_message: "Bad Request.  The series does not exist." }, 400));
    expect(await getSeriesInfo("NOTASERIES")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces FRED's own error text without the key or the help link", async () => {
    fetchMock.mockResolvedValueOnce(json({ error_code: 400, error_message: "Bad Request.  The value for variable api_key is not registered.  Read https://fred.stlouisfed.org/docs/api/api_key.html for more information." }, 400));
    const err = await getObservations("BADKEY1").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Bad Request. The value for variable api_key is not registered.");
    expect((err as Error).message).not.toContain(KEY);
  });

  it("retries a rate-limited request", async () => {
    fetchMock.mockResolvedValueOnce(json({ error_code: 429, error_message: "Too Many Requests.  Exceeded Rate Limit" }, 429)).mockResolvedValueOnce(json(observations));
    const r = await getObservations("DGS2", { start: "2026-08-28", end: "2026-09-08" });
    expect(r.observations).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("searches series by text", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        order_by: "search_rank",
        count: 2,
        seriess: [
          { ...DGS10, id: "MORTGAGE30US", title: "30-Year Fixed Rate Mortgage Average in the United States", frequency: "Weekly, Ending Thursday", frequency_short: "W", popularity: 90 },
          { ...DGS10, id: "OBMMIJUMBO30YF", title: "30-Year Fixed Rate Jumbo Mortgage Index", frequency_short: "D", popularity: 60, notes: undefined },
        ],
      }),
    );
    const hits = await searchSeries("30-year mortgage rate", { limit: 5 });
    expect(hits.map((h) => h.id)).toEqual(["MORTGAGE30US", "OBMMIJUMBO30YF"]);
    expect(calledUrl().searchParams.get("search_text")).toBe("30-year mortgage rate");
    expect(calledUrl().searchParams.get("limit")).toBe("5");
  });

  it("refuses to call FRED without a key", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    await expect(getObservations("NOKEY")).rejects.toThrow("FRED_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("FRED helpers", () => {
  it("parses values", () => {
    expect(parseValue("4.09")).toBe(4.09);
    expect(parseValue("-0.35")).toBe(-0.35);
    expect(parseValue(".")).toBeNull();
    expect(parseValue("")).toBeNull();
  });

  it("thins evenly and always keeps the first and latest points", () => {
    const pts = Array.from({ length: 250 }, (_, i) => i);
    const out = downsample(pts, 60);
    expect(out).toHaveLength(60);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(249);
    expect(out).toEqual([...out].sort((a, b) => a - b));
    expect(downsample(pts.slice(0, 10), 60)).toHaveLength(10);
  });

  it("computes window stats over present values only", () => {
    const s = observationStats([
      { date: "2026-01-01", value: 3 },
      { date: "2026-01-02", value: null },
      { date: "2026-01-03", value: 5 },
      { date: "2026-01-04", value: 1 },
      { date: "2026-01-05", value: 2.5 },
      { date: "2026-01-06", value: null },
    ]);
    expect(s).toEqual({
      first: { date: "2026-01-01", value: 3 },
      latest: { date: "2026-01-05", value: 2.5 },
      previous: { date: "2026-01-04", value: 1 },
      high: { date: "2026-01-03", value: 5 },
      low: { date: "2026-01-04", value: 1 },
      changeOverWindow: -0.5,
    });
    expect(observationStats([{ date: "2026-01-01", value: null }])).toBeNull();
  });
});
