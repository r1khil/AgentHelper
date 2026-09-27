import { describe, expect, it } from "vitest";
import { agendaLine } from "./format";
import { deckMarketNews, deckReleaseName } from "./market-news";
import { weekdayLabel } from "./weeks";

const ev = (date: string, time: string, name: string) => ({ date, name, timestamp: `${date}T${time}:00Z` });
const line = (events: ReturnType<typeof ev>[], from: string, to: string) =>
  agendaLine("Market News", deckMarketNews(events, { from, to }).map((e) => ({ day: weekdayLabel(e.date), text: e.name })));

describe("deckMarketNews", () => {
  // The decks name the same releases; their order within a day varies from week to week, so the app uses release time.
  it("names the releases the 11-Sep deck listed for the week of 2026-09-14, in release-time order", () => {
    // Feed names as the economic calendar returned them; times in UTC.
    const week = [
      ev("2026-09-15", "12:30", "NY Empire State Manufacturing Index"),
      ev("2026-09-16", "12:30", "Retail Sales MoM"),
      ev("2026-09-16", "12:30", "Retail Sales Control Group MoM"),
      ev("2026-09-16", "12:30", "Import Prices MoM"),
      ev("2026-09-16", "14:00", "NAHB Housing Market Index"),
      ev("2026-09-16", "18:00", "Fed Interest Rate Decision"),
      ev("2026-09-16", "18:00", "FOMC Economic Projections"),
      ev("2026-09-16", "18:30", "Fed Press Conference"),
      ev("2026-09-17", "12:30", "Housing Starts"),
      ev("2026-09-17", "12:30", "Building Permits Prel"),
      ev("2026-09-17", "12:30", "Initial Jobless Claims"),
      ev("2026-09-17", "12:30", "Continuing Jobless Claims"),
      ev("2026-09-17", "14:00", "Pending Home Sales MoM"),
    ];
    expect(line(week, "2026-09-14", "2026-09-18")).toBe(
      "Market News: Import Prices, Retail Sales, Federal Reserve Predictions, U.S. Interest Rate Decision, FOMC Meeting (Wednesday), Housing Starts, Weekly Jobless Claims (Thursday)",
    );
  });

  it("names the releases the 21-Sep deck listed for the week of 2026-09-21, in release-time order", () => {
    const week = [
      ev("2026-09-21", "12:30", "Chicago Fed National Activity Index"),
      ev("2026-09-21", "15:00", "UN General Assembly"),
      ev("2026-09-23", "13:45", "S&P Global Manufacturing PMI Flash"),
      ev("2026-09-23", "13:45", "S&P Global Services PMI Flash"),
      ev("2026-09-23", "13:45", "S&P Global Composite PMI Flash"),
      ev("2026-09-24", "12:30", "Current Account"),
      ev("2026-09-24", "12:30", "Initial Jobless Claims"),
      ev("2026-09-24", "14:00", "New Home Sales"),
      ev("2026-09-24", "14:00", "President Trump and President Xi Summit"),
      ev("2026-09-25", "12:30", "Durable Goods Orders MoM"),
      ev("2026-09-25", "14:00", "Michigan Consumer Sentiment Final"),
      ev("2026-09-25", "14:00", "Michigan Current Conditions Final"),
    ];
    expect(line(week, "2026-09-21", "2026-09-25")).toBe(
      "Market News: U.S. Manufacturing PMI, U.S. Services PMI (Wednesday), Weekly Jobless Claims, New Home Sales (Thursday), Durable Goods, Uni. of Mich. Consumer Survey (Friday)",
    );
  });

  it("names CPI once however many series the feed splits it into, and skips days outside the week", () => {
    const week = [ev("2026-09-11", "12:30", "Inflation Rate MoM"), ev("2026-09-11", "12:30", "Inflation Rate YoY"), ev("2026-09-11", "12:30", "CPI"), ev("2026-09-12", "12:30", "PPI MoM")];
    expect(deckMarketNews(week, { from: "2026-09-07", to: "2026-09-11" })).toEqual([{ date: "2026-09-11", name: "CPI" }]);
  });

  it("maps the releases the decks name, including low-importance ones", () => {
    expect(deckReleaseName("Consumer Credit Change")).toBe("Consumer Credit");
    expect(deckReleaseName("Wholesale Inventories MoM")).toBe("Wholesale Trade");
    expect(deckReleaseName("Monthly Budget Statement")).toBe("Treasury Balance");
    expect(deckReleaseName("Fed Goolsbee Speech")).toBeNull();
    expect(deckReleaseName("10-Year Note Auction")).toBeNull();
  });
});
