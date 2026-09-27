import { describe, expect, it } from "vitest";
import { agendaLine, deckName, figureLines, fmtAumK, fmtDeckPct, itemsToLines, linesToItems, normalizeWeekday, packText, performerLine } from "./format";
import type { AgendaItem, WeeklyFigures } from "./types";

describe("fmtDeckPct", () => {
  it("prints one decimal and parenthesises negatives, like the deck", () => {
    expect(fmtDeckPct(6.8)).toBe("6.8%");
    expect(fmtDeckPct(-5.7)).toBe("(5.7%)");
    expect(fmtDeckPct(7.24)).toBe("7.2%");
    expect(fmtDeckPct(0)).toBe("0.0%");
    expect(fmtDeckPct(-0.04)).toBe("0.0%");
    expect(fmtDeckPct(null)).toBe("—");
  });
});

describe("fmtAumK", () => {
  it("prints thousands with a separator and one decimal", () => {
    expect(fmtAumK(4646.9)).toBe("$4,646.9k");
    expect(fmtAumK(912)).toBe("$912.0k");
    expect(fmtAumK(null)).toBe("—");
  });
});

describe("performerLine", () => {
  it("is Company Name (TICKER): pct", () => {
    expect(performerLine({ ticker: "ANAB", name: "AnaptysBio", pct: 7.24 })).toBe("AnaptysBio (ANAB): 7.2%");
    expect(performerLine({ ticker: "LEN", name: "Lennar", pct: -3.14 })).toBe("Lennar (LEN): (3.1%)");
  });
});

describe("agendaLine", () => {
  const items: AgendaItem[] = [
    { day: "Monday", text: "ANAB" },
    { day: "Tuesday", text: "TCOM" },
    { day: "Tuesday", text: "FPS" },
    { day: "Wednesday", text: "LEN" },
  ];

  it("groups consecutive items by weekday and labels the run once", () => {
    expect(agendaLine("Earnings", items)).toBe("Earnings: ANAB (Monday), TCOM, FPS (Tuesday), LEN (Wednesday)");
  });

  it("keeps the order it was given rather than sorting by weekday", () => {
    const reversed = [...items].reverse();
    expect(agendaLine("Earnings", reversed)).toBe("Earnings: LEN (Wednesday), FPS, TCOM (Tuesday), ANAB (Monday)");
  });

  it("leaves items without a day unlabelled, and an empty section bare", () => {
    expect(agendaLine("Market News", [{ day: null, text: "CPI print" }])).toBe("Market News: CPI print");
    expect(agendaLine("Process Updates", [])).toBe("Process Updates:");
  });
});

describe("linesToItems / itemsToLines", () => {
  it("reads a weekday prefix and round-trips", () => {
    const items = linesToItems("Monday: Stock pitch dry run\nmon - Second thing\nNo day here\n\n");
    expect(items).toEqual([
      { day: "Monday", text: "Stock pitch dry run" },
      { day: "Monday", text: "Second thing" },
      { day: null, text: "No day here" },
    ]);
    expect(linesToItems(itemsToLines(items))).toEqual(items);
  });

  it("does not mistake an ordinary sentence for a weekday label", () => {
    expect(linesToItems("Review: models are due")).toEqual([{ day: null, text: "Review: models are due" }]);
  });

  it("normalizes weekday spellings", () => {
    expect(normalizeWeekday("tues")).toBe(null);
    expect(normalizeWeekday("TUE")).toBe("Tuesday");
    expect(normalizeWeekday("wednesday")).toBe("Wednesday");
  });
});

const figures: WeeklyFigures = {
  aumK: { value: 4646.9, source: "entered" },
  ytdPct: { value: 6.8, source: "entered" },
  benchmarkYtdPct: { value: 12.5, source: "entered" },
};

describe("figureLines", () => {
  it("renders the 21-Sep deck's highlights", () => {
    expect(figureLines(figures)).toEqual([
      "AUM: $4,646.9k",
      "YTD Return: 6.8%",
      "YTD Relative Return (vs SPXTR): (5.7%)",
    ]);
  });
});

describe("packText", () => {
  it("lays the pack out in the deck's order", () => {
    const text = packText({
      weekEnding: "2026-09-18",
      figures,
      performers: { top: [{ ticker: "ANAB", name: "AnaptysBio", pct: 7.2 }], worst: [{ ticker: "LEN", name: "Lennar", pct: -3.1 }], missing: [], window: { start: "2026-09-11", end: "2026-09-18" } },
      agenda: { earnings: [{ day: "Monday", text: "ANAB" }], marketNews: [], processUpdates: [] },
      lastWeekAgenda: null,
    });
    expect(text).toContain("Update for the week ended September 18th, 2026");
    expect(text.indexOf("Portfolio Highlights")).toBeLessThan(text.indexOf("Top 3 Performers"));
    expect(text.indexOf("Top 3 Performers")).toBeLessThan(text.indexOf("Worst 3 Performers"));
    expect(text.indexOf("Last Week's Agenda")).toBeLessThan(text.indexOf("This Week's Agenda"));
    expect(text).toContain("AnaptysBio (ANAB): 7.2%");
    expect(text).toContain("Earnings: ANAB (Monday)");
    expect(text).toContain("YTD Performance chart");
  });
});

describe("deckName", () => {
  it("title-cases names filed in capitals and leaves the rest alone", () => {
    expect(deckName("TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD")).toBe("Taiwan Semiconductor Manufacturing Co");
    expect(deckName("MICROSOFT CORP")).toBe("Microsoft Corp");
    expect(deckName("SPDR S&P REGIONAL BANKING ETF")).toBe("SPDR S&P Regional Banking ETF");
    expect(deckName("KKR & Co. Inc.")).toBe("KKR & Co. Inc.");
  });

  it("keeps a company's own name and shortens its suffix the deck's way", () => {
    expect(deckName("Amazon.com, Inc.")).toBe("Amazon.com, Inc.");
    expect(deckName("Microsoft Corporation")).toBe("Microsoft Corp.");
    expect(deckName("Stryker Corporation")).toBe("Stryker Corp.");
    expect(deckName("American Express Company")).toBe("American Express Co.");
    expect(deckName("Taiwan Semiconductor Manufacturing Company Limited")).toBe("Taiwan Semiconductor Manufacturing Co.");
    expect(deckName("The Cigna Group")).toBe("The Cigna Group");
  });
});
