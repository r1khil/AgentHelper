import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coveragePct, fromYahooTop, parseFirstTrustHtml, parseIssuerDate, parseIsharesCsv, parseRoundhillCsv, parseSsgaRows, parseSsgaXlsx } from "./parse";
import { fetchEtfHoldings, fetchIssuerHoldings, plausible, sourceUrl, ETF_SOURCES } from "./sources";
import { bloombergSymbol, issuerKey, listedSymbol, usSymbol } from "./symbols";

// Trimmed copies of the real issuer files as of 2026-09-23/25.
const fixture = (f: string) => new URL(`./fixtures/${f}`, import.meta.url);
const text = (f: string) => readFileSync(fixture(f), "utf8");
const bytes = (f: string) => new Uint8Array(readFileSync(fixture(f)));
const bySymbol = (list: { constituents: { symbol: string; weight: number }[] }) => Object.fromEntries(list.constituents.map((c) => [c.symbol, c.weight]));

describe("symbols", () => {
  it("puts US share classes in Yahoo form and rejects non-tickers", () => {
    expect(usSymbol("BRK.B")).toBe("BRK-B");
    expect(usSymbol("BRK/B")).toBe("BRK-B");
    expect(usSymbol("bf b")).toBe("BF-B");
    expect(usSymbol("NVDA")).toBe("NVDA");
    expect(usSymbol("IXTZ6")).toBeNull(); // a future
    expect(usSymbol("2602335D")).toBeNull(); // a CVR
    expect(usSymbol("-")).toBeNull();
  });

  it("maps Bloomberg exchange codes to Yahoo suffixes", () => {
    expect(bloombergSymbol("4704.JP")).toBe("4704.T");
    expect(bloombergSymbol("OTEX.CN")).toBe("OTEX.TO");
    expect(bloombergSymbol("HO.FP")).toBe("HO.PA");
    expect(bloombergSymbol("000660 KS")).toBe("000660.KS");
    expect(bloombergSymbol("2344 TT")).toBe("2344.TW");
    expect(bloombergSymbol("285A JP")).toBe("285A.T");
    expect(bloombergSymbol("603986 C1")).toBe("603986.SS");
    expect(bloombergSymbol("700 HK")).toBe("0700.HK");
    expect(bloombergSymbol("BRK/B US")).toBe("BRK-B");
    expect(bloombergSymbol("BRK.B")).toBe("BRK-B");
    expect(bloombergSymbol("CRWD")).toBe("CRWD");
  });

  it("keeps a foreign listing distinct from a US ticker with the same letters", () => {
    expect(listedSymbol("K", "Toronto Stock Exchange", "Canada")).toBe("K.TO");
    expect(listedSymbol("NEM", "New York Stock Exchange Inc.", "United States")).toBe("NEM");
    expect(listedSymbol("2099", "Hong Kong Exchanges And Clearing Ltd", "China")).toBe("2099.HK");
    expect(listedSymbol("ERIC B", "Nasdaq Omx Nordic", "Sweden")).toBe("ERIC-B.ST");
    expect(listedSymbol("TRALT.E", "Istanbul Stock Exchange", "Turkey")).toBe("TRALT.IS");
    expect(listedSymbol("ABC", "Some New Venue", "Peru")).toBe("ABC.PER");
  });

  it("drops the trailing dot iShares writes on some London tickers", () => {
    expect(listedSymbol("BP.", "London Stock Exchange", "United Kingdom")).toBe("BP.L");
    expect(listedSymbol("RR.", "London Stock Exchange", "United Kingdom")).toBe("RR.L");
    expect(listedSymbol("BRK.B", "New York Stock Exchange Inc.", "United States")).toBe("BRK-B");
  });

  it("maps Vienna and Warsaw, and leaves out an unknown exchange code instead of reading it as a US share class", () => {
    expect(bloombergSymbol("OMV AV")).toBe("OMV.VI");
    expect(bloombergSymbol("PKO PW")).toBe("PKO.WA");
    expect(bloombergSymbol("ABC QQ")).toBeNull();
    expect(bloombergSymbol("BRK B")).toBe("BRK-B");
  });

  it("collapses share classes of one company", () => {
    expect(issuerKey("GOOGL")).toBe("GOOG");
    expect(issuerKey("GOOG")).toBe("GOOG");
    expect(issuerKey("005935.KS")).toBe("005930.KS");
  });
});

describe("parseIssuerDate", () => {
  it("reads each issuer's date format", () => {
    expect(parseIssuerDate("As of 23-Sep-2026")).toBe("2026-09-23");
    expect(parseIssuerDate("Sep 23, 2026")).toBe("2026-09-23");
    expect(parseIssuerDate("9/23/2026")).toBe("2026-09-23");
    expect(parseIssuerDate("09/25/2026")).toBe("2026-09-25");
    expect(parseIssuerDate("soon")).toBeNull();
  });
});

describe("State Street (SSGA) xlsx", () => {
  it("parses holdings, cleans BRK.B, and drops cash, the CVR and the future", async () => {
    const list = await parseSsgaXlsx("SPY", bytes("ssga-spy.xlsx"));
    expect(list).toMatchObject({ etf: "SPY", asOf: "2026-09-23", source: "ssga" });
    const w = bySymbol(list);
    expect(w.NVDA).toBeCloseTo(8.217272, 6);
    expect(w["BRK-B"]).toBeCloseTo(1.422268, 6);
    expect(w.GOOGL).toBeGreaterThan(0);
    expect(w.GOOG).toBeGreaterThan(0); // Classes stay separate in storage; the math combines them.
    expect(Object.keys(w)).not.toContain("BRK.B");
    expect(list.dropped.map((d) => d.reason).sort()).toEqual(["cash", "derivative", "other"]);
    expect(list.dropped.find((d) => d.reason === "cash")?.weight).toBeCloseTo(0.210631, 6);
    expect(list.constituents.every((c, i, a) => i === 0 || a[i - 1].weight >= c.weight)).toBe(true);
    expect(list.constituents.every((c) => c.sector === null)).toBe(true);
  });

  it("tags a sector SPDR's names with its sector and stops at the disclaimer", () => {
    const rows = [
      ["Fund Name:", "Technology Select Sector SPDR"],
      ["Holdings:", "As of 23-Sep-2026"],
      [],
      ["Name", "Ticker", "Identifier", "SEDOL", "Weight", "Sector"],
      ["NVIDIA CORP", "NVDA", "x", "x", 15.3, "-"],
      ["APPLE INC", "AAPL", "x", "x", 12.1, "-"],
      ["SSI US GOV MONEY MARKET CLASS", "-", "x", "-", 0.03, "-"],
      ["STATE STREET INSTITUTIONAL US GOVERNMENT MONEY MARKET FUND", "GVMXX", "x", "-", 0.02, "-"],
      ["DOLLAR GENERAL CORP", "DG", "x", "x", 0.5, "-"],
      ["EMINI S+P REESTATEDEC26", "XARZ6", "x", "-", -0.009, "-"],
      [],
      ["Past performance is not a reliable indicator.", "", "", "", "", ""],
      ["Stray", "ZZZ", "", "", 9, ""],
    ];
    const list = parseSsgaRows("XLK", rows, { sector: "information_technology" });
    expect(list.constituents.map((c) => [c.symbol, c.sector])).toEqual([
      ["NVDA", "information_technology"],
      ["AAPL", "information_technology"],
      ["DG", "information_technology"],
    ]);
    expect(list.dropped).toEqual([
      { label: "SSI US GOV MONEY MARKET CLASS", weight: 0.03, reason: "cash" },
      { label: "STATE STREET INSTITUTIONAL US GOVERNMENT MONEY MARKET FUND (GVMXX)", weight: 0.02, reason: "cash" },
      { label: "EMINI S+P REESTATEDEC26 (XARZ6)", weight: -0.009, reason: "derivative" },
    ]);
  });

  it("refuses a file without a header", () => {
    expect(() => parseSsgaRows("SPY", [["nothing here"]])).toThrow(/no holdings header/);
  });
});

describe("iShares csv", () => {
  it("parses equities with their sector, suffixes foreign listings and drops cash and futures", () => {
    const list = parseIsharesCsv("RING", text("ishares-ring.csv"));
    expect(list).toMatchObject({ etf: "RING", asOf: "2026-09-23", source: "ishares" });
    const w = bySymbol(list);
    expect(w).toMatchObject({ NEM: 16.7, "AEM.TO": 12.29, "K.TO": 4.27, "ANG.JO": 4.31, "EDV.L": 2.11, "GMD.AX": 1.4, "2099.HK": 1.26, "TRALT.IS": 0.41, CDE: 3.37 });
    expect(w.K).toBeUndefined(); // Kinross in Toronto is not Kellanova.
    expect(w.PLZL).toBeUndefined(); // Zero weight (Russian line written down).
    expect(list.constituents.every((c) => c.sector === "materials")).toBe(true);
    expect(list.dropped.map((d) => d.reason)).toEqual(["cash", "cash", "cash"]);
    expect(list.dropped.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(0.24, 6);
  });
});

describe("First Trust html", () => {
  it("parses the holdings table, mapping Bloomberg codes and dropping currency lines", () => {
    const list = parseFirstTrustHtml("CIBR", text("first-trust-cibr.html"));
    expect(list).toMatchObject({ etf: "CIBR", asOf: "2026-09-23", source: "first-trust" });
    const w = bySymbol(list);
    expect(w).toMatchObject({ CRWD: 8.73, AVGO: 7.37, GOOGL: 1.91, "4704.T": 0.92, "OTEX.TO": 0.66, "HO.PA": 1.84 });
    expect(list.constituents.find((c) => c.symbol === "CRWD")?.name).toBe("CrowdStrike Holdings, Inc. (Class A)");
    expect(list.dropped).toEqual([
      { label: "US Dollar", weight: 0.19, reason: "cash" },
    ]);
  });

  it("fails loudly when the page layout changes", () => {
    expect(() => parseFirstTrustHtml("CIBR", "<html>maintenance</html>")).toThrow(/as-of/);
  });
});

describe("Roundhill csv", () => {
  it("keeps only the requested fund, folds swaps into their stock, and leaves unmatched swaps and collateral out", () => {
    const list = parseRoundhillCsv("DRAM", text("roundhill.csv"));
    expect(list).toMatchObject({ etf: "DRAM", asOf: "2026-09-25", source: "roundhill" });
    const w = bySymbol(list);
    // Micron: 0.42% of shares plus two swaps referencing its CUSIP (16.54% + 9.83%).
    expect(w.MU).toBeCloseTo(0.42 + 16.54 + 9.83, 6);
    // SK hynix: Korean shares plus a swap referencing its SEDOL.
    expect(w["000660.KS"]).toBeCloseTo(16.53 + 5.28, 6);
    expect(w).toMatchObject({ "005930.KS": 18.84, SNDK: 4.74, "2344.TW": 1.09, "603986.SS": 1.02 });
    expect(list.constituents.some((c) => /DRAFTKINGS/i.test(c.name))).toBe(false); // Another fund's line.
    const swap = list.dropped.filter((d) => d.reason === "derivative");
    expect(swap).toEqual([{ label: "CXMT CORPORATION-SWAP-GOLD-L", weight: 5.18, reason: "derivative" }]);
    // T-bills, the money-market fund and the negative financing line are cash and net to about zero.
    const cash = list.dropped.filter((d) => d.reason === "cash").reduce((s, d) => s + d.weight, 0);
    expect(cash).toBeCloseTo(11.29 + 15.31 - 0.03 - 37.87, 6);
  });

  it("says when the fund is missing from the file", () => {
    expect(() => parseRoundhillCsv("NOPE", text("roundhill.csv"))).toThrow(/not in the Roundhill holdings file/);
  });
});

describe("Yahoo fallback", () => {
  it("labels the top holdings with how much of the fund they cover", () => {
    const list = fromYahooTop("KRE", "2026-09-25", [
      { symbol: "BRK.B", name: "Berkshire", weightPct: 3 },
      { symbol: "005930.KS", name: "Samsung", weightPct: 2 },
      { symbol: "ZION", name: "Zions", weightPct: 2.5 },
    ]);
    expect(list.source).toBe("yahoo-top10");
    expect(list.constituents.map((c) => c.symbol)).toEqual(["BRK-B", "ZION", "005930.KS"]);
    expect(coveragePct(list)).toBeCloseTo(7.5, 6);
  });

  it("keeps Yahoo's one-letter exchange suffixes as foreign listings", () => {
    const list = fromYahooTop("RING", "2026-09-25", [
      { symbol: "VOD.L", name: "Vodafone", weightPct: 3 },
      { symbol: "ABC.V", name: "Venture Co", weightPct: 2 },
      { symbol: "BF.B", name: "Brown-Forman", weightPct: 1 },
    ]);
    expect(list.constituents.map((c) => c.symbol)).toEqual(["VOD.L", "ABC.V", "BF-B"]);
  });
});

describe("fetching", () => {
  const respond = (body: BodyInit, type: string, status = 200) => new Response(body, { status, headers: { "content-type": type } });

  it("builds each issuer's URL", () => {
    expect(sourceUrl("KRE", ETF_SOURCES.KRE)).toBe("https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-kre.xlsx");
    expect(sourceUrl("SOXX", ETF_SOURCES.SOXX)).toBe("https://www.ishares.com/us/products/239705/ishares-semiconductor-etf/latest-holdings.csv");
    expect(sourceUrl("SKYY", ETF_SOURCES.SKYY)).toBe("https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=SKYY");
    expect(sourceUrl("DRAM", ETF_SOURCES.DRAM, "2026-09-24")).toBe("https://www.roundhillinvestments.com/assets/data/FilepointRoundhill.40RU.RU_Holdings_09242026.csv");
  });

  it("walks back day by day to the latest Roundhill file", async () => {
    const seen: string[] = [];
    const fetcher = async (url: string) => {
      seen.push(url);
      return url.endsWith("09242026.csv") ? respond(text("roundhill.csv"), "application/octet-stream") : respond("<!doctype html>", "text/html");
    };
    const list = await fetchIssuerHoldings("DRAM", { fetcher, today: "2026-09-26" });
    expect(list.asOf).toBe("2026-09-25");
    expect(seen.map((u) => u.slice(-12, -4))).toEqual(["09262026", "09252026", "09242026"]);
  });

  it("rejects an iShares product page served in place of the CSV", async () => {
    const fetcher = async () => respond("<!DOCTYPE html><html>iShares</html>", "text/csv");
    await expect(fetchIssuerHoldings("SOXX", { fetcher })).rejects.toThrow(/page instead of the holdings CSV/);
  });

  it("falls back to Yahoo's top 10 and keeps the issuer's error", async () => {
    const fetcher = async () => respond("blocked", "text/html", 403);
    const topHoldings = async () => [{ symbol: "ZION", name: "Zions", weightPct: 2.5 }];
    const got = await fetchEtfHoldings("KRE", { fetcher, topHoldings, today: "2026-09-25" });
    expect(got.list.source).toBe("yahoo-top10");
    expect(got.list.asOf).toBe("2026-09-25");
    expect(got.issuerError).toMatch(/HTTP 403/);
  });

  it("uses the issuer file when it parses", async () => {
    const fetcher = async () => respond(bytes("ssga-spy.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const topHoldings = async () => {
      throw new Error("should not be called");
    };
    const got = await fetchEtfHoldings("SPY", { fetcher, topHoldings });
    expect(got).toMatchObject({ issuerError: null, list: { source: "ssga", etf: "SPY" } });
  });

  it("treats a suspiciously thin list as a failure", () => {
    expect(plausible({ etf: "X", asOf: "2026-09-23", source: "ssga", constituents: [{ symbol: "A", name: "A", weight: 50, sector: null }], dropped: [] })).toMatch(/only 1/);
  });
});
