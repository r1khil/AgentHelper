import { describe, expect, it } from "vitest";
import { isQuotePage, pageTier, publisherTier, rankByReliability, sourceTier, syndicatedFrom } from "./sources";

describe("sourceTier", () => {
  it("rates regulators, IR sites and wires as primary", () => {
    expect(sourceTier("https://www.sec.gov/news/press-release/2026-1")).toBe("primary");
    expect(sourceTier("https://www.federalreserve.gov/x")).toBe("primary");
    expect(sourceTier("https://home.treasury.gov/news")).toBe("primary");
    expect(sourceTier("https://www.nhtsa.gov/recalls")).toBe("primary");
    expect(sourceTier("https://investor.apple.com/news/default.aspx")).toBe("primary");
    expect(sourceTier("https://ir.aboutamazon.com/news-release")).toBe("primary");
    expect(sourceTier("https://www.businesswire.com/news/home/1")).toBe("primary");
    expect(sourceTier("https://edge.prnewswire.com/c/link?t=0&u=https%3A%2F%2Fwww.marketwatch.com%2Finvesting%2Fstock%2FSTLA")).toBe("established");
    expect(sourceTier("https://edge.prnewswire.com/c/link?t=0&u=https%3A%2F%2Fblog.example%2Fa")).toBe("other");
  });
  it("rates major newsrooms as established, including subdomains", () => {
    expect(sourceTier("https://www.reuters.com/markets/")).toBe("established");
    expect(sourceTier("apnews.com")).toBe("established");
    expect(sourceTier("https://markets.ft.com/data")).toBe("established");
  });
  it("rates social, forums and content farms as low, and does not match lookalikes", () => {
    expect(sourceTier("https://old.reddit.com/r/stocks")).toBe("low");
    expect(sourceTier("https://seekingalpha.com/article/1")).toBe("low");
    expect(sourceTier("https://www.fool.com/investing/")).toBe("low");
    expect(sourceTier("https://notreuters.com/a")).toBe("other");
    expect(sourceTier("https://reuters.com.evil.example/a")).toBe("other");
    expect(sourceTier("")).toBe("other");
  });
});

describe("publisherTier", () => {
  it("maps Finnhub publisher names", () => {
    expect(publisherTier("Reuters")).toBe("established");
    expect(publisherTier("SeekingAlpha")).toBe("low");
    expect(publisherTier("Business Wire")).toBe("primary");
    expect(publisherTier("Yahoo")).toBe("other");
    expect(publisherTier("cnbc.com")).toBe("established");
  });
});

describe("rankByReliability", () => {
  it("drops off-topic padding and boosts reliable sources without letting them jump far more relevant pages", () => {
    // Scores from a real production search for why GOOG fell on 2026-09-23.
    const xs = [
      { id: "stla-release", t: "primary" as const, s: 0.046 },
      { id: "treasury", t: "primary" as const, s: 0.027 },
      { id: "morningstar", t: "established" as const, s: 0.088 },
      { id: "barchart-goog", t: "other" as const, s: 0.68 },
      { id: "wsj-market", t: "established" as const, s: 0.62 },
      { id: "yahoo-goog", t: "other" as const, s: 0.378 },
      { id: "reddit", t: "low" as const, s: 0.9 },
    ];
    expect(rankByReliability(xs, (x) => x.t, (x) => x.s).map((x) => x.id)).toEqual(["wsj-market", "barchart-goog", "yahoo-goog"]);
  });
  it("keeps the original order on ties and returns nothing for an empty pool", () => {
    const xs = [
      { id: "a", t: "other" as const, s: 0.5 },
      { id: "b", t: "other" as const, s: 0.5 },
    ];
    expect(rankByReliability(xs, (x) => x.t, (x) => x.s).map((x) => x.id)).toEqual(["a", "b"]);
    expect(rankByReliability([], () => "other", () => 0)).toEqual([]);
  });
});

describe("syndication", () => {
  // Pages Hoot read in production on 2026-09-23.
  it("rates a Benzinga story reposted on TradingView as Benzinga", () => {
    const url = "https://www.tradingview.com/news/benzinga:d85307743094b:0-what-s-going-on-with-amazon-stock-wednesday";
    expect(syndicatedFrom({ url })).toEqual({ name: "benzinga", tier: "low" });
    expect(pageTier({ url, title: "What's Going On With Amazon Stock Wednesday? - TradingView" })).toEqual({ tier: "low", syndicatedFrom: "benzinga" });
  });
  it("rates a 24/7 Wall St. piece behind a Finnhub/Yahoo link by its title suffix", () => {
    const p = { url: "https://finnhub.io/api/news?id=e61c2b877a19", title: "Shopify Sinks 5%, Meta Ticks Up as Muse Deal Rally Unwinds; Amazon Slips - 24/7 Wall St." };
    expect(pageTier(p)).toEqual({ tier: "low", syndicatedFrom: "24/7 Wall St" });
  });
  it("reads a publisher byline on the first line of the text", () => {
    expect(pageTier({ url: "https://finance.yahoo.com/news/x.html", title: "Some headline", text: "Motley Fool\nSome headline\nBody" }).tier).toBe("low");
  });
  it("leaves ordinary titles and trusted hosts alone, and never upgrades a host", () => {
    expect(pageTier({ url: "https://www.cnbc.com/2026/09/23/x.html", title: "CCTV Script 23/09/26 - CNBC" })).toEqual({ tier: "established", syndicatedFrom: null });
    expect(pageTier({ url: "https://www.wsj.com/a", title: "Stocks Slip - The Wall Street Journal" }).tier).toBe("established");
    expect(pageTier({ url: "https://blog.example/a", title: "Rates, risk - and what comes next" }).syndicatedFrom).toBeNull();
    expect(pageTier({ url: "https://finance.yahoo.com/news/y.html", title: "Fed holds rates - Reuters" })).toEqual({ tier: "other", syndicatedFrom: "Reuters" });
  });
});

describe("isQuotePage", () => {
  it("spots quote and ticker hub pages", () => {
    expect(isQuotePage("https://www.wsj.com/market-data/quotes/AMZN")).toBe(true);
    expect(isQuotePage("https://www.marketwatch.com/investing/stock/amzn?countrycode=ch")).toBe(true);
    expect(isQuotePage("https://finance.yahoo.com/quote/GOOG/")).toBe(true);
    expect(isQuotePage("https://www.cnbc.com/quotes/AMZN")).toBe(true);
    expect(isQuotePage("https://www.google.com/finance/quote/AMZN:NASDAQ")).toBe(true);
    expect(isQuotePage("https://www.nasdaq.com/market-activity/stocks/amzn")).toBe(true);
  });
  it("keeps articles and live coverage", () => {
    expect(isQuotePage("https://www.cnbc.com/2026/09/23/cctv-script-23/09/26.html")).toBe(false);
    expect(isQuotePage("https://www.marketwatch.com/livecoverage/stock-market-today-dow-s-p-500-nasdaq-firm-start")).toBe(false);
    expect(isQuotePage("https://finance.yahoo.com/markets/stocks/articles/alphabet-drops-4-meta-edges-165741579.html")).toBe(false);
    expect(isQuotePage("https://www.barchart.com/story/news/4760039/how-to-play-google-stock")).toBe(false);
  });
});
