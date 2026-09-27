import { describe, expect, it } from "vitest";
import type { NewsItem } from "@/lib/providers/types";
import { parseWhy, whyPrompt } from "./why";

const movers = [
  { ticker: "MSFT", name: "Microsoft Corp.", pct: 2.9 },
  { ticker: "NEE", name: "NextEra Energy, Inc.", pct: -4.46 },
  { ticker: "KKR", name: "KKR & Co. Inc.", pct: -4.13 },
];
const item = (id: string, headline: string): NewsItem => ({ id, headline, url: `https://example.com/${id}`, source: "Reuters", publishedAt: "2026-09-23T14:00:00Z" });
const news = new Map([
  ["MSFT", [item("m1", "Microsoft wins large cloud contract"), item("m2", "Microsoft shares rise")]],
  ["NEE", [item("n1", "Utilities slide as yields climb")]],
  ["KKR", []],
]);

describe("movers' notes", () => {
  it("numbers each ticker's headlines in the prompt", () => {
    const prompt = whyPrompt(movers, news);
    expect(prompt).toContain("MSFT (Microsoft Corp.), +2.9% for the week:\n1. Microsoft wins large cloud contract (Reuters, 2026-09-23)\n2. Microsoft shares rise");
    expect(prompt).toContain("KKR (KKR & Co. Inc.), -4.1% for the week:\n(no headlines)");
  });

  it("keeps only notes that cite one of that ticker's own headlines, and attaches the link itself", () => {
    const raw = `[{"ticker":"NEE","why":"Fell with utilities as Treasury yields climbed.","headline":1},
      {"ticker":"MSFT","why":"Rose after a large cloud contract.","headline":1},
      {"ticker":"KKR","why":"Fell on private credit worries.","headline":1},
      {"ticker":"AAPL","why":"Not a mover.","headline":1},
      {"ticker":"MSFT","why":"A second note.","headline":2}]`;
    expect(parseWhy(raw, movers, news)).toEqual([
      { ticker: "MSFT", text: "Rose after a large cloud contract.", headline: "Microsoft wins large cloud contract", source: "Reuters", url: "https://example.com/m1" },
      { ticker: "NEE", text: "Fell with utilities as Treasury yields climbed.", headline: "Utilities slide as yields climb", source: "Reuters", url: "https://example.com/n1" },
    ]);
  });

  it("throws when the model returns no JSON array, so the build records the failure and sends without notes", () => {
    expect(() => parseWhy("I could not find anything.", movers, news)).toThrow();
  });
});
