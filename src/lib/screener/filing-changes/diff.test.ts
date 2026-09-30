import { describe, expect, it } from "vitest";
import { maskSentence, splitSentences } from "./mask";
import { CHANGE_THRESHOLD, compareSections, needsLabels, parseSection } from "./diff";

const para = (...s: string[]) => s.join(" ");

// Long enough (over 400 characters) for the shrink rule to apply.
const RISKS = [
  "Our business depends on a small number of large wholesale customers in North America.",
  "Changes in interest rates could reduce the value of our investment portfolio and our net interest margin.",
  "We face intense competition from larger banks with greater resources and broader product offerings.",
  "Cybersecurity incidents could disrupt our operations and expose us to litigation and regulatory penalties.",
  "Our loan portfolio is concentrated in commercial real estate in a small number of metropolitan markets.",
];

describe("maskSentence", () => {
  it("masks numbers, money and percentages", () => {
    expect(maskSentence("Revenue rose 12.5% to $1,234.5 million.")).toBe(maskSentence("Revenue rose 3% to $987 million."));
  });

  it("masks dates and period names", () => {
    const a = maskSentence("For the three months ended June 30, 2025, net sales increased compared with the first quarter of fiscal 2025.");
    const b = maskSentence("For the nine months ended September 30, 2026, net sales increased compared with the third quarter of fiscal 2026.");
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d|june|september|three|nine/);
  });

  it("masks Q and FY shorthand and written numbers", () => {
    expect(maskSentence("In Q2 FY25 two customers accounted for most sales.")).toBe(maskSentence("In Q3 FY26 three customers accounted for most sales."));
  });

  it("keeps words that change the meaning", () => {
    expect(maskSentence("Revenue increased 5% from the prior year.")).not.toBe(maskSentence("Revenue decreased 5% from the prior year."));
  });
});

describe("splitSentences", () => {
  it("splits sentences but not on abbreviations", () => {
    const s = splitSentences("We sell to the U.S. Government and to Acme Inc. under long contracts. Sales fell sharply this year overall. Short one.");
    expect(s.map((x) => x.text)).toEqual(["We sell to the U.S. Government and to Acme Inc. under long contracts.", "Sales fell sharply this year overall."]);
  });

  it("drops table rows of numbers and short headings", () => {
    expect(splitSentences("Risk Factors\nNet revenue\t$ 1,234\t$ 1,100\nOur results could fluctuate significantly from quarter to quarter.")).toHaveLength(1);
  });
});

describe("compareSections", () => {
  const prior = para(...RISKS);

  it("does not count a sentence that only moved", () => {
    const moved = para(...[...RISKS].reverse());
    const c = compareSections(moved, prior);
    expect(c.score).toBe(0);
    expect(c.diff.added).toEqual([]);
    expect(c.diff.removed).toEqual([]);
  });

  it("sends a sentence whose numbers rolled forward to numbersChanged, not added/removed", () => {
    const before = para(...RISKS, "One customer accounted for 12% of net sales in fiscal 2024.");
    const after = para(...RISKS, "One customer accounted for 18% of net sales in fiscal 2025.");
    const c = compareSections(after, before);
    expect(c.score).toBe(0);
    expect(c.diff.numbersChanged).toEqual([{ before: "One customer accounted for 12% of net sales in fiscal 2024.", after: "One customer accounted for 18% of net sales in fiscal 2025." }]);
  });

  it("scores the share of sentences added or removed", () => {
    const after = para(...RISKS.slice(0, 4), "A material weakness in our internal control over financial reporting was identified.");
    const c = compareSections(after, prior);
    expect(c.diff.added).toEqual(["A material weakness in our internal control over financial reporting was identified."]);
    expect(c.diff.removed).toEqual([RISKS[4]]);
    expect(c.score).toBeCloseTo(2 / 6);
    expect(needsLabels(c)).toBe(c.score >= CHANGE_THRESHOLD);
  });

  it("treats 'no material changes' boilerplate as empty, whatever its length, and not as a shrink", () => {
    const boiler = `Item 1A. Risk Factors\nThere have been no material changes to the risk factors disclosed in Part I, Item 1A of our Annual Report on Form 10-K for the year ended December 31, 2025. ${"The risks described there are not the only risks facing the Company. ".repeat(8)}`;
    expect(parseSection(boiler).kind).toBe("no_change");
    const c = compareSections(boiler, prior);
    expect(c.saysNoChange).toBe(true);
    expect(c.shrink).toBeNull();
    expect(c.score).toBe(0);
  });

  it("does not treat an 'except as set forth below' update as boilerplate", () => {
    expect(parseSection("Except as set forth below, there have been no material changes to our risk factors. Tariffs on imported components could materially increase our costs.").kind).toBe("text");
  });

  it("flags a section that shrank by more than half", () => {
    const c = compareSections(para(RISKS[0], RISKS[1]), prior);
    expect(c.shrink).toBe("shrunk");
  });

  it("flags a section that disappeared, and one cut to 'None.'", () => {
    expect(compareSections(null, prior).shrink).toBe("removed");
    expect(compareSections("Item 3. Legal Proceedings\nNone.", prior).shrink).toBe("shrunk");
  });

  it("never flags a shrink when only additions count (10-Q Item 1A)", () => {
    const c = compareSections(RISKS[0], prior, { addedOnly: true });
    expect(c.shrink).toBeNull();
    expect(c.diff.removed).toEqual([]);
  });

  it("suppresses sentences the immediately prior filing already had (10-Q MD&A)", () => {
    const lastYear = para(...RISKS.slice(0, 4));
    const lastQuarter = para(...RISKS.slice(0, 3), "We opened a new distribution center in Texas to serve the region.");
    const now = para(...RISKS.slice(0, 3), "We opened a new distribution center in Texas to serve the region.", "We entered into a new revolving credit facility with our lenders.");
    const c = compareSections(now, lastYear, { suppressWith: lastQuarter });
    // The distribution center was new last quarter and was flagged then; the credit facility is new now.
    expect(c.diff.added).toEqual(["We entered into a new revolving credit facility with our lenders."]);
    // RISKS[3] was already gone last quarter, so its removal was flagged then too.
    expect(c.diff.removed).toEqual([]);
  });
});
