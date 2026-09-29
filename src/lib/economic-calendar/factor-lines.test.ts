import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeEvent } from "./normalize";
import { bookExposure, factorLine, factorLineAudience, factorLines, releaseRule, releaseWhen, sensitivityLabel, RELEASE_FACTORS } from "./factor-lines";
import type { EconomicEvent } from "./types";

// Dates this year print without the year ("Tue, Sep 22"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

// TradingView titles and categories as the live feed carries them (Sep 2026), with its importance mapped to 1–3.
const tv = (name: string, category: string, importance: 1 | 2 | 3, timestamp = "2026-10-15T12:30:00.000Z", date = "2026-10-15"): EconomicEvent =>
  makeEvent({ id: `tv:${name}`, name, category, importance, timestamp, date, source: "TradingView" });

const rule = (name: string, category: string | null) => releaseRule({ name, category })?.key ?? null;

describe("releaseRule", () => {
  it("maps inflation, jobs, Fed and GDP releases to rates and dollar", () => {
    expect(rule("Inflation Rate MoM", "Prices")).toBe("cpi");
    expect(rule("Core Inflation Rate YoY", "Prices")).toBe("cpi");
    expect(rule("CPI s.a", "Prices")).toBe("cpi");
    expect(rule("Core PCE Price Index MoM", "Prices")).toBe("pce");
    expect(rule("PPI MoM", "Prices")).toBe("ppi");
    expect(rule("Non Farm Payrolls", "Labor")).toBe("jobs");
    expect(rule("Nonfarm Payrolls Private", "Labor")).toBe("jobs");
    expect(rule("Unemployment Rate", "Labor")).toBe("jobs");
    expect(rule("Fed Interest Rate Decision", "Money")).toBe("fomc");
    expect(rule("FOMC Minutes", "Money")).toBe("fomc");
    expect(rule("Fed Press Conference", "Money")).toBe("fomc");
    expect(rule("GDP Growth Rate QoQ Final", "GDP")).toBe("gdp");
    expect(rule("GDP Price Index QoQ Final", "Prices")).toBe("gdp");
    for (const key of ["cpi", "pce", "ppi", "jobs", "fomc", "gdp"]) expect(RELEASE_FACTORS.find((r) => r.key === key)!.factors).toEqual(["rates", "dollar"]);
  });

  it("maps EIA crude and OPEC to oil", () => {
    expect(rule("EIA Crude Oil Stocks Change", "Energy")).toBe("eia-crude");
    expect(rule("EIA Cushing Crude Oil Stocks Change", "Energy")).toBe("eia-crude");
    expect(rule("OPEC Meeting", null)).toBe("opec");
    expect(RELEASE_FACTORS.find((r) => r.key === "eia-crude")!.factors).toEqual(["oil"]);
  });

  it("leaves look-alikes out", () => {
    expect(rule("Michigan Inflation Expectations Prel", "Prices")).toBeNull();
    expect(rule("Consumer Inflation Expectations", "Prices")).toBeNull();
    expect(rule("Interest Rate Projection - Longer", "Money")).toBeNull();
    expect(rule("Fed Waller Speech", "Money")).toBeNull();
    expect(rule("API Crude Oil Stock Change", "Energy")).toBeNull();
    expect(rule("EIA Gasoline Stocks Change", "Energy")).toBeNull();
    expect(rule("Atlanta Fed GDPNow", "GDP")).toBeNull();
    expect(rule("Initial Jobless Claims", "Labor")).toBeNull();
    expect(rule("Government Payrolls", "Labor")).toBeNull();
  });

  it("checks TradingView's category, but matches other providers on the name", () => {
    expect(rule("Unemployment Rate", "Housing")).toBeNull();
    expect(rule("CPI m/m", null)).toBe("cpi");
    expect(rule("Crude Stocks", "Agency release")).toBe("eia-crude");
    expect(rule("Employment Situation", "Bureau of Labor Statistics")).toBe("jobs");
  });
});

describe("factorLine", () => {
  const cpi = tv("Inflation Rate MoM", "Prices", 3);
  const book = { subject: "the book", betas: { rates: { beta: -0.12, t: -3.1 }, dollar: { beta: 0.03, t: 0.8 } } };

  it("writes the plan's example line", () => {
    const shortRatesOnly = { subject: "the book", betas: { rates: { beta: -0.12, t: -3.1 } } };
    const line = factorLine(cpi, RELEASE_FACTORS.find((r) => r.key === "cpi")!, shortRatesOnly);
    expect(line.text).toBe("CPI Thu, Oct 15, 8:30 AM ET · rates- and dollar-sensitive · the book is net short duration (β (0.12))");
  });

  it("says when an exposure isn't statistically clear, and never describes it as a position", () => {
    const line = factorLine(cpi, releaseRule(cpi)!, book);
    expect(line.text).toBe("CPI Thu, Oct 15, 8:30 AM ET · rates- and dollar-sensitive · the book is net short duration (β (0.12)); no clear dollar exposure (β 0.03, not significant)");
    // The Fund's real 1-year betas on 2026-09-25: rates +0.055 (t 1.6), dollar +0.038 (t 1.1).
    const today = factorLine(cpi, releaseRule(cpi)!, { subject: "the book", betas: { rates: { beta: 0.055, t: 1.6 }, dollar: { beta: 0.038, t: 1.1 } } });
    expect(today.text).toBe("CPI Thu, Oct 15, 8:30 AM ET · rates- and dollar-sensitive · the book has no clear rates or dollar exposure (β 0.06 and 0.04, not significant)");
    expect(today.text).not.toMatch(/duration|long|short/);
    const ratesOnly = factorLine(cpi, { ...releaseRule(cpi)!, factors: ["rates"] }, { subject: "the book", betas: { rates: { beta: 0.055, t: 1.6 } } });
    expect(ratesOnly.text).toBe("CPI Thu, Oct 15, 8:30 AM ET · rates-sensitive · the book has no clear rates exposure (β 0.06, not significant)");
  });

  it("calls a significant beta that rounds to zero negligible", () => {
    const eia = tv("EIA Crude Oil Stocks Change", "Energy", 2, "2026-10-14T14:30:00.000Z", "2026-10-14");
    expect(factorLine(eia, releaseRule(eia)!, { subject: "the book", betas: { oil: { beta: 0.004, t: 2.2 } } }).text).toBe("EIA crude Wed, Oct 14, 10:30 AM ET · oil-sensitive · the book has no clear oil exposure (β 0.00, negligible)");
  });

  it("shows only the sensitivity without an exposure", () => {
    expect(factorLine(cpi, releaseRule(cpi)!, null).text).toBe("CPI Thu, Oct 15, 8:30 AM ET · rates- and dollar-sensitive");
  });

  it("describes oil for the EIA report", () => {
    const eia = tv("EIA Crude Oil Stocks Change", "Energy", 2, "2026-10-14T14:30:00.000Z", "2026-10-14");
    expect(factorLine(eia, releaseRule(eia)!, { subject: "the book", betas: { oil: { beta: 0.06, t: 2.4 } } }).text).toBe("EIA crude Wed, Oct 14, 10:30 AM ET · oil-sensitive · the book is net long oil (β 0.06)");
  });

  it("builds the exposure from a regression row", () => {
    const fit = { betas: { market: { beta: 1, se: 0.1, t: 10, significant: true }, rates: { beta: -0.12, se: 0.04, t: -3, significant: true } } } as never;
    expect(bookExposure("the book", fit).betas.rates).toEqual({ beta: -0.12, t: -3 });
  });

  it("never tells anyone to trade", () => {
    const line = factorLine(cpi, releaseRule(cpi)!, book);
    expect(line.text).not.toMatch(/\b(buy|sell|hedge|should|consider|reduce|add|trim)\b/i);
  });
});

describe("factorLines", () => {
  it("gives each release one line a day, for important releases only, in time order", () => {
    const events = [
      tv("Core Inflation Rate MoM", "Prices", 3),
      tv("Inflation Rate YoY", "Prices", 3),
      tv("CPI", "Prices", 2),
      tv("Initial Jobless Claims", "Labor", 2),
      tv("PCE Price Index MoM", "Prices", 2),
      tv("Fed Interest Rate Decision", "Money", 3, "2026-10-14T18:00:00.000Z", "2026-10-14"),
      tv("Fed Press Conference", "Money", 3, "2026-10-14T18:30:00.000Z", "2026-10-14"),
      tv("EIA Crude Oil Stocks Change", "Energy", 2, "2026-10-14T14:30:00.000Z", "2026-10-14"),
      tv("EIA Crude Oil Imports Change", "Energy", 1, "2026-10-14T14:30:00.000Z", "2026-10-14"),
    ];
    expect(factorLines(events, null).map((l) => l.text)).toEqual([
      "EIA crude Wed, Oct 14, 10:30 AM ET · oil-sensitive",
      "FOMC Wed, Oct 14, 2:00 PM ET · rates- and dollar-sensitive",
      "CPI Thu, Oct 15, 8:30 AM ET · rates- and dollar-sensitive",
    ]);
  });
});

describe("releaseWhen", () => {
  it("prints the New York day and time", () => {
    expect(releaseWhen({ timestamp: "2026-10-15T12:30:00.000Z", date: "2026-10-15", time: "8:30 AM", tentative: false })).toBe("Thu, Oct 15, 8:30 AM ET");
    expect(releaseWhen({ timestamp: null, date: "2026-10-15", time: "All day", tentative: false })).toBe("Thu, Oct 15");
    expect(releaseWhen({ timestamp: null, date: "2026-10-15", time: "Tentative", tentative: true })).toBe("Thu, Oct 15");
  });
});

describe("sensitivityLabel", () => {
  it("joins factor names", () => {
    expect(sensitivityLabel(["rates"])).toBe("rates-sensitive");
    expect(sensitivityLabel(["rates", "dollar"])).toBe("rates- and dollar-sensitive");
    expect(sensitivityLabel(["rates", "dollar", "oil"])).toBe("rates-, dollar- and oil-sensitive");
  });
});

describe("factorLineAudience", () => {
  it("shows the Fund to execs and admins, the team to its lead, and only the label to everyone else", () => {
    expect(factorLineAudience({ role: "exec", teamId: "t1" })).toEqual({ kind: "fund" });
    expect(factorLineAudience({ role: "admin", teamId: null })).toEqual({ kind: "fund" });
    expect(factorLineAudience({ role: "lead_analyst", teamId: "t1" })).toEqual({ kind: "team", teamId: "t1" });
    expect(factorLineAudience({ role: "lead_analyst", teamId: null })).toEqual({ kind: "label" });
    expect(factorLineAudience({ role: "associate_analyst", teamId: "t1" })).toEqual({ kind: "label" });
  });
});
