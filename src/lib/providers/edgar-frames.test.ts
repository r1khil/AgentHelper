import { describe, expect, it, vi } from "vitest";
vi.mock("./cache", () => ({ cached: async (_k: string, _t: number, fn: () => unknown) => fn() }));
import { frameId, frameUrl, parseFrame, parseTickersExchange, profileFromSubmissions } from "./edgar-frames";

describe("frames", () => {
  it("builds the frames URL, writing ratio units with -per-", () => {
    expect(frameUrl({ taxonomy: "us-gaap", concept: "Revenues", unit: "USD", period: "CY2025" })).toBe("https://data.sec.gov/api/xbrl/frames/us-gaap/Revenues/USD/CY2025.json");
    expect(frameUrl({ taxonomy: "us-gaap", concept: "EarningsPerShareDiluted", unit: "USD/shares", period: "CY2025" })).toContain("/USD-per-shares/CY2025.json");
    expect(frameId({ taxonomy: "dei", concept: "EntityCommonStockSharesOutstanding", unit: "shares", period: "CY2025Q4I" })).toBe("dei/EntityCommonStockSharesOutstanding/shares/CY2025Q4I");
  });
  it("keeps well-formed rows", () => {
    const rows = parseFrame({ taxonomy: "us-gaap", tag: "Revenues", ccp: "CY2025", uom: "USD", pts: 3, data: [
      { accn: "a", cik: 320193, start: "2024-09-29", end: "2025-09-27", val: 416161000000 },
      { accn: "b", cik: 2, end: "2025-12-31", val: Number.NaN },
      { accn: "c", cik: 3, end: "", val: 5 },
    ] });
    expect(rows).toEqual([{ cik: 320193, val: 416161000000, end: "2025-09-27", start: "2024-09-29", accn: "a" }]);
    expect(parseFrame(null)).toEqual([]);
  });
});

describe("parseTickersExchange", () => {
  it("keeps NYSE and Nasdaq, one row per company (its primary ticker)", () => {
    const out = parseTickersExchange({ fields: ["cik", "name", "ticker", "exchange"], data: [
      [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"],
      [1652044, "Alphabet Inc.", "GOOG", "Nasdaq"],
      [1067983, "BERKSHIRE HATHAWAY INC", "brk-b", "NYSE"],
      [99, "Pink Sheet Co", "PINK", "OTC"],
      [98, "No Exchange", "NOEX", null],
      [97, "Cboe Co", "CBO", "CBOE"],
    ] });
    expect(out).toEqual([
      { cik: "0001652044", name: "Alphabet Inc.", ticker: "GOOGL", exchange: "Nasdaq" },
      { cik: "0001067983", name: "BERKSHIRE HATHAWAY INC", ticker: "BRK-B", exchange: "NYSE" },
    ]);
  });
});

describe("profileFromSubmissions", () => {
  it("reads SIC, fiscal year end and the latest annual form", () => {
    expect(profileFromSubmissions("320193", { name: "Apple Inc.", sic: "3571", sicDescription: "Electronic Computers", fiscalYearEnd: "0926", filings: { recent: { form: ["4", "8-K", "10-Q", "10-K/A", "10-K"] } } })).toEqual({
      cik: "0000320193",
      name: "Apple Inc.",
      sic: "3571",
      sicDescription: "Electronic Computers",
      fiscalYearEnd: "0926",
      annualForm: "10-K",
    });
  });
  it("marks foreign filers and falls back when the 10-K fell off the recent list", () => {
    expect(profileFromSubmissions("1", { filings: { recent: { form: ["6-K", "20-F"] } } }).annualForm).toBe("20-F");
    expect(profileFromSubmissions("1", { filings: { recent: { form: ["4", "10-Q"] } } }).annualForm).toBe("10-K");
    expect(profileFromSubmissions("1", { filings: { recent: { form: ["6-K"] } } }).annualForm).toBe("20-F");
    expect(profileFromSubmissions("1", { filings: { recent: { form: ["S-1"] } } }).annualForm).toBeNull();
  });
});
