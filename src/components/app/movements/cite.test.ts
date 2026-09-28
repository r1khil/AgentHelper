import { describe, expect, it } from "vitest";
import { citationFor, gist, insertAt } from "./cite";

describe("gist", () => {
  it("keeps a short headline whole", () => {
    expect(gist("CoreWeave and Nebius Score Upgrades")).toBe("CoreWeave and Nebius Score Upgrades");
  });

  it("cuts a long headline on a word boundary", () => {
    expect(gist("Meta's stock surges as it moves from AI laggard to leader")).toBe("Meta's stock surges as it moves from AI…");
    expect(gist("Oracle, Qualcomm, Meta, Everpure, BlackBerry, MGM, Nebius, and More")).toBe("Oracle, Qualcomm, Meta, Everpure…");
  });

  it("hard-cuts a headline with no usable space", () => {
    expect(gist("x".repeat(60), 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("citationFor", () => {
  it("names the publisher, the New York date and the headline", () => {
    const e = { title: "Meta's stock surges as it moves from AI laggard to leader", publisher: "Yahoo", publishedAt: new Date("2026-09-24T19:40:25Z") };
    expect(citationFor(e, "News")).toBe("[Yahoo, Sep 24: Meta's stock surges as it moves from AI…]");
  });

  it("uses New York's date for a late-evening UTC time", () => {
    const e = { title: "After-hours note", publisher: "Yahoo", publishedAt: new Date("2026-09-25T02:00:00Z") };
    expect(citationFor(e, "News")).toBe("[Yahoo, Sep 24: After-hours note]");
  });

  it("leaves out a missing date and falls back to the kind for a missing publisher", () => {
    expect(citationFor({ title: "XLC +1.27% (+1.3 pp vs S&P)", publisher: "Yahoo Finance", publishedAt: null }, "Peer move")).toBe("[Yahoo Finance: XLC +1.27% (+1.3 pp vs S&P)]");
    expect(citationFor({ title: "8-K", publisher: null, publishedAt: null }, "SEC filing")).toBe("[SEC filing: 8-K]");
  });
});

describe("insertAt", () => {
  const cite = "[Yahoo, Sep 24: X]";

  it("inserts into an empty draft", () => {
    expect(insertAt("", 0, 0, cite)).toEqual({ start: 0, end: 0, insert: cite, text: cite, caret: cite.length });
  });

  it("spaces a citation off the word before it and keeps it snug against punctuation", () => {
    const text = "Shares rose on the launch.";
    const at = text.indexOf(".");
    const r = insertAt(text, at, at, cite);
    expect(r.text).toBe(`Shares rose on the launch ${cite}.`);
    expect(r.caret).toBe(r.text.length - 1);
  });

  it("adds a space before a word that follows, and puts the caret after it", () => {
    const r = insertAt("Shares rose", 0, 0, cite);
    expect(r.text).toBe(`${cite} Shares rose`);
    expect(r.text.slice(r.caret)).toBe("Shares rose");
    expect(insertAt("rose sharply", 4, 4, cite).text).toBe(`rose ${cite} sharply`);
  });

  it("adds no extra spaces next to whitespace or an opening parenthesis", () => {
    expect(insertAt("rose ", 5, 5, cite).text).toBe(`rose ${cite}`);
    expect(insertAt("()", 1, 1, cite).text).toBe(`(${cite})`);
  });

  it("replaces a selection", () => {
    const r = insertAt("rose [cite here] today", 5, 16, cite);
    expect(r.text).toBe(`rose ${cite} today`);
    expect(r).toMatchObject({ start: 5, end: 16, insert: cite });
  });

  it("clamps an out-of-range selection to the end", () => {
    expect(insertAt("rose", 10, 12, cite)).toEqual({ start: 4, end: 4, insert: ` ${cite}`, text: `rose ${cite}`, caret: 5 + cite.length });
  });
});
