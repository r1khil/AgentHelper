import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  teams: [{ id: "team-fin", slug: "financials", name: "Financials" }] as { id: string; slug: string; name: string }[],
  sectors: [{ teamId: "team-fin", sector: "financials" }],
}));

vi.mock("@/db/schema", () => ({ teams: { id: "id", slug: "slug", name: "name", __t: "teams" }, teamSectors: { __t: "team_sectors" } }));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: async (t: { __t: string }) => (t.__t === "teams" ? m.teams : m.sectors) }),
  },
}));
vi.mock("@/lib/providers/yahoo", () => ({ getDailyBars: vi.fn(), getAdjustedBarsRange: vi.fn() }));
vi.mock("@/lib/backtesting/load", () => ({ loadSnapshot: vi.fn() }));
vi.mock("@/lib/attribution/store", () => ({ loadSeries: vi.fn() }));
vi.mock("@/lib/attribution/attribution", () => ({ computeAttribution: vi.fn(), computeTeamAttribution: vi.fn() }));

import { getAdjustedBarsRange, getDailyBars } from "@/lib/providers/yahoo";
import { loadSnapshot } from "@/lib/backtesting/load";
import { loadSeries } from "@/lib/attribution/store";
import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import type { CurrentUser } from "@/lib/auth";
import { datasetFile, loadDataset, parseDatasetName, rangeStart, toCsv } from "./datasets";

const user = (role: string, teamId: string | null = "team-fin") => ({ id: "u1", role, teamId, team: null }) as unknown as CurrentUser;

describe("helpers", () => {
  it("quotes CSV cells that need it and blanks missing numbers", () => {
    expect(toCsv(["a", "b", "c"], [["x,y", 'say "hi"', null], [1.5, Number.NaN, undefined]])).toBe('a,b,c\n"x,y","say ""hi""",\n1.5,,\n');
  });

  it("parses dataset names and rejects unknown ones", () => {
    expect(parseDatasetName("prices:axp")).toEqual({ kind: "prices", arg: "AXP" });
    expect(parseDatasetName("prices:^GSPC")).toEqual({ kind: "prices", arg: "^GSPC" });
    expect(parseDatasetName("holdings")).toEqual({ kind: "holdings", arg: null });
    expect(parseDatasetName("returns")).toEqual({ kind: "returns", arg: null });
    expect(parseDatasetName("returns:team")).toEqual({ kind: "returns", arg: "team" });
    expect(() => parseDatasetName("prices:")).toThrow("give a ticker");
    expect(() => parseDatasetName("prices:rm -rf /")).toThrow();
    expect(() => parseDatasetName("fundamentals:AXP")).toThrow("Unknown dataset");
    expect(() => parseDatasetName("returns:other-team")).toThrow("Unknown dataset");
  });

  it("maps names to safe file paths", () => {
    expect(datasetFile("prices:AXP")).toBe("data/prices_AXP.csv");
    expect(datasetFile("prices:^GSPC")).toBe("data/prices_GSPC.csv");
    expect(datasetFile("prices:BRK.B")).toBe("data/prices_BRK_B.csv");
    expect(datasetFile("returns:fund")).toBe("data/returns_fund.csv");
  });

  it("turns ranges into start dates", () => {
    const today = DateTime.fromISO("2026-09-25", { zone: "America/New_York" });
    expect(rangeStart("1y", today)).toBe("2025-09-25");
    expect(rangeStart("3m", today)).toBe("2026-06-25");
    expect(rangeStart("ytd", today)).toBe("2026-01-01");
    expect(rangeStart("itd", today)).toBe("2021-09-25");
  });
});

describe("prices dataset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 11:00 in New York: today's session is still open.
    vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("writes OHLCV with dividend-adjusted closes, leaves out today's open session, and cites Yahoo like get_price_history", async () => {
    vi.mocked(getDailyBars).mockResolvedValue([
      { date: "2025-09-24", close: 1 },
      { date: "2026-09-23", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
      { date: "2026-09-24", open: 100, high: 102, low: 99, close: 101.123456, volume: 2000 },
      { date: "2026-09-25", close: 150 },
    ]);
    vi.mocked(getAdjustedBarsRange).mockResolvedValue([{ date: "2026-09-24", close: 100.5 }]);
    const d = await loadDataset({ viewer: user("analyst"), teamId: "team-fin" }, { name: "prices:axp" });
    expect(d).toMatchObject({ name: "prices:AXP", path: "data/prices_AXP.csv", rows: 2, firstDate: "2026-09-23", lastDate: "2026-09-24" });
    expect(d.content).toBe("date,open,high,low,close,adj_close,volume\n2026-09-23,99,101,98,100,,1000\n2026-09-24,100,102,99,101.1235,100.5,2000\n");
    expect(d.source.id).toMatch(/^yh-/);
    expect(d.source.url).toBe("https://finance.yahoo.com/quote/AXP/history/");
    expect(vi.mocked(getAdjustedBarsRange).mock.calls[0].slice(1)).toEqual(["2025-09-25", "2026-09-25"]);
  });

  it("still works when adjusted history is unavailable", async () => {
    vi.mocked(getDailyBars).mockResolvedValue([{ date: "2026-09-24", close: 10 }]);
    vi.mocked(getAdjustedBarsRange).mockRejectedValue(new Error("Backtesting requires USD-denominated history."));
    const d = await loadDataset({ viewer: user("analyst"), teamId: "team-fin" }, { name: "prices:SAP.DE", range: "1m" });
    expect(d.rows).toBe(1);
    expect(d.note).toContain("adj_close is unavailable");
  });

  it("fails clearly with no bars", async () => {
    vi.mocked(getDailyBars).mockResolvedValue([]);
    vi.mocked(getAdjustedBarsRange).mockResolvedValue([]);
    await expect(loadDataset({ viewer: user("analyst"), teamId: "team-fin" }, { name: "prices:ZZZZ" })).rejects.toThrow("No daily prices for ZZZZ");
  });
});

describe("holdings dataset", () => {
  it("uses What if's snapshot for the viewer's scope", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue({
      positions: [
        { id: "1", ticker: "AXP", name: "American Express", weight: 0.6 },
        { id: "2", ticker: "JPM", name: "JPMorgan, Chase", weight: 0.4 },
        { id: "c", ticker: "CASH", name: "Cash", weight: 0, kind: "cash" },
      ],
      version: "v1",
      scope: "Financials portfolio",
      capturedAt: "2026-09-25T12:00:00Z",
      savedWeightTotal: 8,
      sleeve: true,
    } as never);
    const viewer = user("analyst");
    const d = await loadDataset({ viewer, teamId: "team-fin" }, { name: "holdings" });
    expect(loadSnapshot).toHaveBeenCalledWith(viewer);
    expect(d.content).toBe('ticker,name,weight,kind\nAXP,American Express,0.6,stock\nJPM,"JPMorgan, Chase",0.4,stock\n');
    expect(d.source).toMatchObject({ sourceType: "Fund holdings", title: "Financials portfolio, current holdings and saved weights" });
  });
});

describe("returns dataset", () => {
  const series = {
    inception: "2025-01-02",
    latest: "2026-09-24",
    series: {},
    index: new Map([["2026-09-22", 100], ["2026-09-23", 101], ["2026-09-24", 99.99]]),
  };
  const result = {
    portfolioReturn: 0.015,
    cumulative: [
      { date: "2026-09-22", portfolio: 0, benchmark: 0, active: 0 },
      { date: "2026-09-23", portfolio: 0.01, benchmark: 0.02, active: -0.01 },
      { date: "2026-09-24", portfolio: 0.015, benchmark: null, active: null },
    ],
  };
  beforeEach(() => {
    vi.mocked(loadSeries).mockResolvedValue(series as never);
    vi.mocked(computeAttribution).mockReturnValue(result as never);
    vi.mocked(computeTeamAttribution).mockReturnValue(result as never);
  });

  it("gives execs the fund's daily returns with the S&P 500, citing the Performance view", async () => {
    const d = await loadDataset({ viewer: user("exec"), teamId: "team-fin" }, { name: "returns" });
    expect(d.name).toBe("returns");
    expect(d.columns).toEqual(["date", "return", "sector_benchmark_return", "sp500_return"]);
    expect(d.content.split("\n")[1]).toBe("2026-09-23,0.01,0.02,0.01");
    expect(d.content.split("\n")[2]).toBe("2026-09-24,0.0049505,,-0.01");
    expect(d.source.id).toMatch(/^attr-/);
    expect(d.source.url).toContain("/t/fund/performance?period=itd");
  });

  it("refuses whole-fund returns to analysts", async () => {
    await expect(loadDataset({ viewer: user("analyst"), teamId: "team-fin" }, { name: "returns:fund" })).rejects.toThrow("execs and admins only");
  });

  it("refuses team returns to an analyst who is not the lead", async () => {
    await expect(loadDataset({ viewer: user("analyst"), teamId: "team-fin" }, { name: "returns" })).rejects.toThrow("lead analyst");
  });

  it("gives a team's lead its sleeve's returns without the S&P 500 column", async () => {
    const d = await loadDataset({ viewer: user("lead_analyst"), teamId: "team-fin" }, { name: "returns:team", range: "1y" });
    expect(computeTeamAttribution).toHaveBeenCalledWith(series.series, expect.objectContaining({ key: "1y" }), "team-fin", ["financials"]);
    expect(d.columns).toEqual(["date", "return", "sector_benchmark_return"]);
    expect(d.source.url).toContain("/t/financials/performance?period=1y");
  });

  it("explains an empty ledger", async () => {
    vi.mocked(loadSeries).mockResolvedValue({ ...series, inception: null } as never);
    await expect(loadDataset({ viewer: user("admin"), teamId: "team-fin" }, { name: "returns" })).rejects.toThrow("No returns yet");
  });
});
