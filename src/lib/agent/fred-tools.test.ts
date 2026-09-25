import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/fred", async (original) => ({
  ...(await original<object>()),
  searchSeries: vi.fn(),
  getSeriesInfo: vi.fn(),
  getObservations: vi.fn(),
}));

import { DateTime } from "luxon";
import { getObservations, getSeriesInfo, searchSeries, type FredObservation, type FredSeries } from "@/lib/providers/fred";
import type { ToolResult } from "./tools";
import { makeFredTools, MAX_POINTS, resolveAlias } from "./fred-tools";

const series = (over: Partial<FredSeries> = {}): FredSeries => ({
  id: "T10Y2Y",
  title: "10-Year Treasury Constant Maturity Minus 2-Year Treasury Constant Maturity",
  frequency: "Daily",
  frequencyShort: "D",
  units: "Percent",
  unitsShort: "%",
  seasonalAdjustment: "Not Seasonally Adjusted",
  seasonalAdjustmentShort: "NSA",
  lastUpdated: "2026-09-25 16:02:11-05",
  observationStart: "1976-06-01",
  observationEnd: "2026-09-25",
  popularity: 100,
  ...over,
});
const obs = (rows: [string, number | null][]) => ({ seriesId: "X", units: "lin" as const, frequency: null, aggregation: null, start: "", end: "", observations: rows.map(([date, value]): FredObservation => ({ date, value })) });

type Input = { seriesId?: string; query?: string; start?: string; end?: string; transform?: "level" | "change" | "pct_change" | "yoy"; frequency?: "daily" | "weekly" | "monthly" | "quarterly" | "annual"; aggregation?: "average" | "end_of_period" | "sum" };
const run = (input: Input) => {
  const t = makeFredTools().get_macro_series;
  return (t.execute as (i: unknown, o: unknown) => Promise<ToolResult<Record<string, unknown> | null>>)({ transform: "level", aggregation: "average", ...input }, { toolCallId: "t" });
};

beforeEach(() => {
  vi.mocked(searchSeries).mockReset();
  vi.mocked(getSeriesInfo).mockReset();
  vi.mocked(getObservations).mockReset();
});

describe("resolveAlias", () => {
  it("maps the names students use to FRED ids", () => {
    expect(resolveAlias("2s10s")?.id).toBe("T10Y2Y");
    expect(resolveAlias("HY spread")?.id).toBe("BAMLH0A0HYM2");
    expect(resolveAlias("IG OAS")?.id).toBe("BAMLC0A0CM");
    expect(resolveAlias("10-year")?.id).toBe("DGS10");
    expect(resolveAlias("2Y")?.id).toBe("DGS2");
    expect(resolveAlias("Core CPI")?.id).toBe("CPILFESL");
    expect(resolveAlias("cpi")?.id).toBe("CPIAUCSL");
    expect(resolveAlias("unemployment rate")?.id).toBe("UNRATE");
    expect(resolveAlias("fed funds")?.id).toBe("FEDFUNDS");
    expect(resolveAlias("fed funds rate")?.id).toBe("DFF");
    expect(resolveAlias("EFFR")?.id).toBe("DFF");
    expect(resolveAlias("FEDFUNDS")?.id).toBe("FEDFUNDS");
    expect(resolveAlias("VIX")?.id).toBe("VIXCLS");
    expect(resolveAlias("WTI")?.id).toBe("DCOILWTICO");
    expect(resolveAlias("dxy")).toMatchObject({ id: "DTWEXBGS", note: expect.stringContaining("not ICE's DXY") });
    expect(resolveAlias("housing starts")).toBeNull();
  });
});

describe("get_macro_series", () => {
  it("fetches a shortcut without searching and returns cite-able observations", async () => {
    vi.mocked(getSeriesInfo).mockResolvedValue(series());
    vi.mocked(getObservations).mockResolvedValue(obs([["2026-09-22", 0.52], ["2026-09-23", 0.55], ["2026-09-24", null], ["2026-09-25", 0.57]]));
    const r = await run({ seriesId: "2s10s", start: "2026-09-22", end: "2026-09-25" });
    expect(searchSeries).not.toHaveBeenCalled();
    expect(getSeriesInfo).toHaveBeenCalledWith("T10Y2Y");
    expect(getObservations).toHaveBeenCalledWith("T10Y2Y", { start: "2026-09-22", end: "2026-09-25", units: "lin", frequency: undefined, aggregation: undefined });
    expect(r.error).toBeUndefined();
    const d = r.data!;
    expect(d.latest).toEqual({ date: "2026-09-25", value: 0.57 });
    expect(d.previous).toEqual({ date: "2026-09-23", value: 0.55 });
    expect(d.observations).toEqual([["2026-09-22", 0.52], ["2026-09-23", 0.55], ["2026-09-25", 0.57]]);
    expect(d.seriesNote).toMatch(/negative means inverted/);
    expect(d.note).toMatch(/1 date with no value/);
    expect(r.sources).toHaveLength(1);
    const s = r.sources[0];
    expect(s.url).toBe("https://fred.stlouisfed.org/series/T10Y2Y");
    expect(s.id).toMatch(/^fred-/);
    expect(s.id).toBe(d.sourceId);
    expect(s.publishedAt).toBe("2026-09-25");
    expect(s.excerpt).toMatch(/^T10Y2Y 0.57 on 2026-09-25; prev 0.55 2026-09-23/);
  });

  it("maps transform and frequency to FRED's units and aggregation", async () => {
    vi.mocked(getSeriesInfo).mockResolvedValue(series({ id: "CPIAUCSL", title: "Consumer Price Index for All Urban Consumers: All Items in U.S. City Average", frequency: "Monthly", frequencyShort: "M", units: "Index 1982-1984=100", seasonalAdjustmentShort: "SA" }));
    vi.mocked(getObservations).mockResolvedValue(obs([["2026-06-01", 2.7], ["2026-07-01", 2.9], ["2026-08-01", 3.1]]));
    const r = await run({ query: "CPI", transform: "yoy", frequency: "quarterly", aggregation: "end_of_period", end: "2026-09-25" });
    expect(getObservations).toHaveBeenCalledWith("CPIAUCSL", { start: "2016-09-25", end: "2026-09-25", units: "pc1", frequency: "q", aggregation: "eop" });
    expect(r.data!.units).toBe("Percent change from a year ago (Index 1982-1984=100)");
    expect(r.data!.frequency).toBe("quarterly (end of period of monthly data)");
    expect(r.sources[0].title).toContain("percent change from a year ago");
  });

  it("defaults the window by frequency: a year of daily data ending today", async () => {
    vi.mocked(getSeriesInfo).mockResolvedValue(series());
    vi.mocked(getObservations).mockResolvedValue(obs([["2026-09-25", 0.57]]));
    await run({ seriesId: "T10Y2Y" });
    const today = DateTime.now().setZone("America/New_York");
    expect(vi.mocked(getObservations).mock.calls[0][1]).toMatchObject({ start: today.minus({ years: 1 }).toISODate(), end: today.toISODate() });
  });

  it("thins long windows but keeps stats from every observation", async () => {
    vi.mocked(getSeriesInfo).mockResolvedValue(series({ id: "DGS10" }));
    const start = DateTime.fromISO("2025-01-01");
    const rows = Array.from({ length: 300 }, (_, i): [string, number] => [start.plus({ days: i }).toISODate()!, i === 150 ? 9.99 : 4 + i / 1000]);
    vi.mocked(getObservations).mockResolvedValue(obs(rows));
    const d = (await run({ seriesId: "DGS10", start: "2025-01-01", end: "2025-10-27" })).data!;
    expect((d.observations as unknown[]).length).toBe(MAX_POINTS);
    expect(d.observationCount).toBe(300);
    expect(d.high).toEqual({ date: rows[150][0], value: 9.99 });
    expect(d.latest).toEqual({ date: rows[299][0], value: 4.299 });
    expect(d.note).toMatch(/Thinned to 60 of 300/);
  });

  it("returns candidates, not data, when a search has several matches", async () => {
    vi.mocked(searchSeries).mockResolvedValue([
      series({ id: "HOUST", title: "New Privately-Owned Housing Units Started: Total Units", frequency: "Monthly", popularity: 80 }),
      series({ id: "HOUSTNSA", title: "New Privately-Owned Housing Units Started: Total Units", seasonalAdjustmentShort: "NSA", popularity: 50 }),
      series({ id: "HOUST1F", title: "Housing Starts: 1-Unit Structures (DISCONTINUED)", popularity: 40 }),
    ]);
    const r = await run({ query: "housing starts" });
    expect(getObservations).not.toHaveBeenCalled();
    expect(r.sources).toEqual([]);
    const c = r.data!.candidates as Record<string, unknown>[];
    expect(c.map((x) => x.seriesId)).toEqual(["HOUST", "HOUSTNSA", "HOUST1F"]);
    expect(c[2].discontinued).toBe(true);
    expect(r.data!.note).toMatch(/call get_macro_series again with the seriesId/i);
  });

  it("fetches the only match of a search", async () => {
    vi.mocked(searchSeries).mockResolvedValue([series({ id: "MORTGAGE30US", frequency: "Weekly, Ending Thursday", frequencyShort: "W" })]);
    vi.mocked(getSeriesInfo).mockResolvedValue(series({ id: "MORTGAGE30US", frequency: "Weekly, Ending Thursday", frequencyShort: "W" }));
    vi.mocked(getObservations).mockResolvedValue(obs([["2026-09-18", 6.1]]));
    const r = await run({ query: "30-year fixed mortgage average weekly" });
    expect(getSeriesInfo).toHaveBeenCalledWith("MORTGAGE30US");
    expect(r.sources[0].url).toBe("https://fred.stlouisfed.org/series/MORTGAGE30US");
  });

  it("reports an unknown id, a reversed window, and a provider failure as errors instead of throwing", async () => {
    vi.mocked(getSeriesInfo).mockResolvedValueOnce(null);
    expect((await run({ seriesId: "NOPE123" })).error).toMatch(/no series "NOPE123"/);

    vi.mocked(getSeriesInfo).mockResolvedValue(series());
    expect((await run({ seriesId: "T10Y2Y", start: "2026-09-25", end: "2026-01-01" })).error).toMatch(/after end/);

    vi.mocked(getObservations).mockRejectedValueOnce(new Error("Bad Request. The value for variable frequency is not valid."));
    const r = await run({ seriesId: "T10Y2Y", frequency: "daily" });
    expect(r).toMatchObject({ data: null, sources: [], error: expect.stringMatching(/frequency/) });

    expect((await run({})).error).toMatch(/Pass seriesId/);
  });

  it("says so when the window holds no values", async () => {
    vi.mocked(getSeriesInfo).mockResolvedValue(series());
    vi.mocked(getObservations).mockResolvedValue(obs([["2026-09-07", null]]));
    const r = await run({ seriesId: "T10Y2Y", start: "2026-09-07", end: "2026-09-07" });
    expect(r.sources).toEqual([]);
    expect(r.data!.note).toMatch(/No observations between/);
  });
});
