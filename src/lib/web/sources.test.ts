import { describe, expect, it } from "vitest";
import { publisherTier, rankByReliability, sourceTier } from "./sources";

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
