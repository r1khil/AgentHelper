import { describe, expect, it } from "vitest";
import { chunkDiff, labelDiff, parseLabels, relevantNumbers, SENTENCE_CHAR_BUDGET, type Generate } from "./label-model";
import { quoteInFiling } from "./quote-check";

const FILING = "Item 1A. Risk Factors\nWe identified a material weakness in our internal control over financial reporting related to revenue recognition — which we are remediating.\nOur largest customer’s contract expires in 2027.";

describe("quoteInFiling", () => {
  it("normalizes curly quotes, dashes and whitespace on both sides", () => {
    expect(quoteInFiling("related to revenue recognition - which we are remediating", [FILING])).toBe(true);
    expect(quoteInFiling("Our largest customer's   contract expires in 2027", [FILING])).toBe(true);
    expect(quoteInFiling("“We identified a material weakness in our internal control”", [FILING])).toBe(true);
  });

  it("fails a paraphrase or a too-short quote", () => {
    expect(quoteInFiling("We found a material weakness in internal control", [FILING])).toBe(false);
    expect(quoteInFiling("material weakness", [FILING])).toBe(false);
  });
});

describe("parseLabels", () => {
  it("reads fenced JSON and skips unknown labels", () => {
    const raw = '```json\n{"changes": [{"label": "controls", "summary": "A material weakness was disclosed.", "quote": "We identified a material weakness"}, {"label": "vibes", "summary": "x", "quote": "y"}]}\n```';
    expect(parseLabels(raw)).toEqual([{ label: "controls", summary: "A material weakness was disclosed.", quote: "We identified a material weakness" }]);
  });

  it("repairs output cut off mid-entry and drops the half-written one", () => {
    const raw = '{"changes": [{"label": "controls", "summary": "Weakness.", "quote": "We identified a material weakness in our internal control"}, {"label": "customer_concentration", "summary": "Largest cust';
    expect(parseLabels(raw).map((c) => c.label)).toEqual(["controls"]);
  });

  it("returns nothing for prose", () => {
    expect(parseLabels("No material changes.")).toEqual([]);
  });
});

describe("labelDiff", () => {
  const diff = {
    added: ["We identified a material weakness in our internal control over financial reporting related to revenue recognition — which we are remediating."],
    removed: ["Our internal control over financial reporting was effective as of year end."],
    numbersChanged: [{ before: "Our largest customer’s contract expires in 2026.", after: "Our largest customer’s contract expires in 2027." }],
  };
  const stub =
    (reply: string): Generate =>
    async () => ({ text: reply });

  it("keeps labels whose quote is in the filing and drops the rest", async () => {
    const reply = JSON.stringify({
      changes: [
        { label: "controls", summary: "A material weakness in revenue controls was disclosed.", quote: "We identified a material weakness in our internal control over financial reporting" },
        { label: "new_risk_factor", summary: "Invented.", quote: "We may be unable to obtain financing on acceptable terms" },
        { label: "customer_concentration", summary: "Contract runs to 2027.", quote: "Our largest customer's contract expires in 2027" },
      ],
    });
    const r = await labelDiff({ ticker: "ACME", form: "10-K", item: "9A", diff }, { generate: stub(reply), texts: [FILING, ...diff.removed] });
    expect(r.labels.map((l) => l.label)).toEqual(["controls", "customer_concentration"]);
    expect(r.dropped).toEqual([{ label: "new_risk_factor", reason: "quote not found in the filing" }]);
    // The model never writes a number into our tables: that summary had a year in it.
    expect(r.labels[1].summary).toBeNull();
    expect(r.calls).toBe(1);
  });

  it("accepts a quote from a removed sentence (checked against the earlier words)", async () => {
    const reply = JSON.stringify({ changes: [{ label: "section_shrunk", summary: "The effectiveness statement is gone.", quote: "Our internal control over financial reporting was effective" }] });
    const r = await labelDiff({ ticker: "ACME", form: "10-K", item: "9A", diff }, { generate: stub(reply), texts: [FILING, ...diff.removed] });
    expect(r.labels).toHaveLength(1);
  });

  it("splits a large diff into several calls, capped", async () => {
    const big = { added: Array.from({ length: 40 }, (_, i) => `${"Risk sentence number ".repeat(60)}${i}.`), removed: [], numbersChanged: [] };
    const chunks = chunkDiff(big);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.added.join("").length).toBeLessThanOrEqual(SENTENCE_CHAR_BUDGET);
    let calls = 0;
    const r = await labelDiff({ ticker: "ACME", form: "10-K", item: "1A", diff: big }, { generate: async () => (calls++, { text: '{"changes": []}' }), texts: [], maxCalls: 2 });
    expect(calls).toBe(2);
    expect(r.chunks).toBe(chunks.length);
  });

  it("stops before a call when the run is out of time", async () => {
    const r = await labelDiff({ ticker: "ACME", form: "10-K", item: "1A", diff }, { generate: stub('{"changes": []}'), texts: [], canCall: () => false });
    expect(r).toMatchObject({ calls: 0, stopped: true });
  });

  it("shows the model only numbers-changed sentences about customers or non-GAAP measures", () => {
    expect(relevantNumbers({ added: [], removed: [], numbersChanged: [{ before: "Revenue was $5 million.", after: "Revenue was $6 million." }, ...diff.numbersChanged] })).toEqual(diff.numbersChanged);
  });
});
