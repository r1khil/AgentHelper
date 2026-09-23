import { describe, expect, it } from "vitest";
import { pickMarketNews } from "./market-news";

const range = { from: "2026-09-21", to: "2026-09-25" };
const ev = (date: string, importance: 1 | 2 | 3 | null, name: string) => ({ date, importance, name });

describe("pickMarketNews", () => {
  it("drops auctions, speeches, inventories and positioning whatever their importance", () => {
    const picks = pickMarketNews(
      [
        ev("2026-09-22", 2, "2-Year Note Auction"),
        ev("2026-09-22", 2, "Fed Governor Jefferson Speech"),
        ev("2026-09-23", 3, "EIA Crude Oil Stocks Change"),
        ev("2026-09-25", 2, "Baker Hughes US Oil Rig Count"),
        ev("2026-09-25", 2, "CFTC S&P 500 Non-Commercial Net Positions"),
        ev("2026-09-24", 3, "Initial Jobless Claims"),
      ],
      range,
    );
    expect(picks.map((p) => p.name)).toEqual(["Initial Jobless Claims"]);
  });

  it("collapses companion series into the headline release on the same day", () => {
    const picks = pickMarketNews(
      [
        ev("2026-09-24", 3, "New Home Sales"),
        ev("2026-09-24", 2, "New Home Sales m/m"),
        ev("2026-09-24", 2, "Continuing Jobless Claims"),
        ev("2026-09-24", 3, "Initial Jobless Claims"),
        ev("2026-09-25", 3, "Durable Goods Orders m/m"),
        ev("2026-09-25", 2, "Core Durable Goods Orders m/m"),
        ev("2026-09-25", 2, "Michigan Consumer Sentiment"),
        ev("2026-09-25", 2, "Michigan Consumer Expectations"),
        ev("2026-09-25", 2, "Michigan 5-Year Inflation Expectations"),
      ],
      range,
    );
    expect(picks.map((p) => `${p.date} ${p.name}`)).toEqual([
      "2026-09-24 Initial Jobless Claims",
      "2026-09-24 New Home Sales",
      "2026-09-25 Durable Goods Orders",
      "2026-09-25 Michigan Consumer Sentiment",
    ]);
  });

  it("keeps a companion series when its headline is not released that day", () => {
    const picks = pickMarketNews([ev("2026-09-23", 2, "Continuing Jobless Claims"), ev("2026-09-23", 2, "Core PCE Price Index m/m")], range);
    expect(picks.map((p) => p.name)).toEqual(["Continuing Jobless Claims", "Core PCE Price Index"]);
  });

  it("lists an event running several days once, on its first day", () => {
    const picks = pickMarketNews(
      ["2026-09-21", "2026-09-22", "2026-09-23"].map((d) => ev(d, 2, "UN General Assembly")),
      range,
    );
    expect(picks.map((p) => `${p.date} ${p.name}`)).toEqual(["2026-09-21 UN General Assembly"]);
  });

  it("drops mortgage surveys and weekly series in Trading Economics naming", () => {
    const picks = pickMarketNews(
      [
        ev("2026-09-23", 2, "MBA 30-Year Mortgage Rate"),
        ev("2026-09-22", 2, "ADP Employment Change Weekly"),
        ev("2026-09-24", 2, "Initial Jobless Claims"),
      ],
      range,
    );
    expect(picks.map((p) => p.name)).toEqual(["Initial Jobless Claims"]);
  });

  it("collapses CPI, FOMC, flash PMI, GDP and ex-item variants into one line each", () => {
    const picks = pickMarketNews(
      [
        ev("2026-09-21", 3, "Inflation Rate YoY"),
        ev("2026-09-21", 3, "Inflation Rate MoM"),
        ev("2026-09-21", 3, "Core Inflation Rate MoM"),
        ev("2026-09-21", 2, "CPI"),
        ev("2026-09-21", 2, "CPI s.a"),
        ev("2026-09-22", 3, "Fed Interest Rate Decision"),
        ev("2026-09-22", 2, "Fed Press Conference"),
        ev("2026-09-22", 2, "FOMC Economic Projections"),
        ev("2026-09-23", 2, "S&P Global Composite PMI Flash"),
        ev("2026-09-23", 2, "S&P Global Manufacturing PMI Flash"),
        ev("2026-09-23", 2, "S&P Global Services PMI Flash"),
        ev("2026-09-24", 3, "GDP Growth Rate QoQ Final"),
        ev("2026-09-24", 2, "GDP Price Index QoQ Final"),
        ev("2026-09-25", 3, "Retail Sales MoM"),
        ev("2026-09-25", 2, "Retail Sales Ex Autos MoM"),
        ev("2026-09-25", 2, "Retail Sales Control Group MoM"),
      ],
      range,
    );
    expect(picks.map((p) => `${p.date} ${p.name}`)).toEqual([
      "2026-09-21 Inflation Rate",
      "2026-09-22 Fed Interest Rate Decision",
      "2026-09-23 S&P Global Composite PMI",
      "2026-09-24 GDP Growth Rate",
      "2026-09-25 Retail Sales",
    ]);
  });

  it("ignores low importance, out-of-range dates, and caps the list", () => {
    const many = Array.from({ length: 15 }, (_, i) => ev("2026-09-22", 3 as const, `Release ${String(i).padStart(2, "0")}`));
    const picks = pickMarketNews([...many, ev("2026-09-22", 1, "Minor"), ev("2026-09-28", 3, "Next week")], range, 5);
    expect(picks).toHaveLength(5);
    expect(picks.every((p) => p.date === "2026-09-22" && p.name.startsWith("Release"))).toBe(true);
  });
});
