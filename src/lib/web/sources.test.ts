import { describe, expect, it } from "vitest";
import { publisherTier, rankByTier, sourceTier } from "./sources";

describe("sourceTier", () => {
  it("rates regulators, IR sites and wires as primary", () => {
    expect(sourceTier("https://www.sec.gov/news/press-release/2026-1")).toBe("primary");
    expect(sourceTier("https://www.federalreserve.gov/x")).toBe("primary");
    expect(sourceTier("https://home.treasury.gov/news")).toBe("primary");
    expect(sourceTier("https://www.nhtsa.gov/recalls")).toBe("primary");
    expect(sourceTier("https://investor.apple.com/news/default.aspx")).toBe("primary");
    expect(sourceTier("https://ir.aboutamazon.com/news-release")).toBe("primary");
    expect(sourceTier("https://www.businesswire.com/news/home/1")).toBe("primary");
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

describe("rankByTier", () => {
  it("sorts by tier, then score, keeping order on ties", () => {
    const xs = [
      { id: "a", t: "other" as const, s: 1 },
      { id: "b", t: "established" as const, s: 0.2 },
      { id: "c", t: "primary" as const, s: 0.1 },
      { id: "d", t: "established" as const, s: 0.9 },
      { id: "e", t: "other" as const, s: 1 },
    ];
    expect(rankByTier(xs, (x) => x.t, (x) => x.s).map((x) => x.id)).toEqual(["c", "d", "b", "a", "e"]);
  });
});
