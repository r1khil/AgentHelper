import { describe, expect, it } from "vitest";
import { citationsFor, normalizeForQuote, parseAnswer, quoteAppears, sentences, sourcesBlock, verifySentences, type CiteSource } from "./cited";

const sources: CiteSource[] = [
  { n: 1, label: "10-K Item 1", url: "https://sec.gov/a", text: "We design chips for data centers.\nOur largest customer accounted for 18% of revenue." },
  { n: 2, label: "10-Q Item 2", url: "https://sec.gov/b", text: "Liquidity tightened as the “revolving facility” matures in 2027 — we are negotiating." },
];

describe("quote check", () => {
  it("matches across curly quotes, dashes, whitespace and case", () => {
    expect(normalizeForQuote("“A” —  b")).toBe('"a" - b');
    expect(quoteAppears('the "revolving facility" matures in 2027 - we are', sources[1].text)).toBe(true);
    expect(quoteAppears("the facility matures in 2028", sources[1].text)).toBe(false);
    expect(quoteAppears("   ", sources[1].text)).toBe(false);
  });
});

describe("verifySentences", () => {
  it("passes cited sentences with quotes found in a cited source", () => {
    expect(verifySentences([{ text: "Designs chips.", cites: [1] }, { text: "Refinancing risk.", cites: [2], quote: "matures in 2027" }], sources)).toBeNull();
  });

  it("holds back an uncited claim, an unknown source, or a quote from a source it doesn't cite", () => {
    expect(verifySentences([{ text: "Great moat.", cites: [] }], sources)).toMatch(/Uncited/);
    expect(verifySentences([{ text: "X.", cites: [3] }], sources)).toMatch(/wasn't given/);
    expect(verifySentences([{ text: "X.", cites: [1], quote: "matures in 2027" }], sources)).toMatch(/Quote not found/);
  });
});

describe("parsing", () => {
  it("repairs a cut-off answer and drops malformed sentences", () => {
    const json = parseAnswer('Sure! {"business": [{"text": "A.", "cites": [1]}, {"cites": [2]}], "questions": [');
    expect(sentences(json?.business)).toEqual([{ text: "A.", cites: [1] }]);
    expect(parseAnswer("no json here")).toBeNull();
  });
});

describe("citationsFor and sourcesBlock", () => {
  it("lists only the sources cited", () => {
    expect(citationsFor([{ text: "A.", cites: [2] }], sources)).toEqual([{ n: 2, url: "https://sec.gov/b", label: "10-Q Item 2" }]);
  });

  it("numbers the sources and shares the budget between them", () => {
    const block = sourcesBlock(sources, 40);
    expect(block).toContain("[1] 10-K Item 1\nWe design chips for ");
    expect(block.length).toBeLessThan(120);
  });
});
