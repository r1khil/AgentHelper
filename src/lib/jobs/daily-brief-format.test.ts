import { describe, expect, it } from "vitest";
import type { Source } from "@/lib/providers/types";
import { briefEmail, cleanBrief, numberCitations, sourcesFooter } from "./daily-brief-format";

const src = (id: string, title: string): Source => ({ id, title, publisher: "Reuters", url: `https://example.com/${id}`, retrievedAt: "2026-09-22T21:05:00Z", publishedAt: "2026-09-22T14:00:00Z" });

describe("numberCitations", () => {
  const known = new Map([
    ["news-a", src("news-a", "KRE falls on rate fears")],
    ["news-b", src("news-b", "NVDA beats")],
  ]);

  it("numbers cited sources in order of first use and reuses numbers", () => {
    const r = numberCitations("NVDA rose [src:news-b]. KRE fell [src:news-a][src:news-b]. Again [src:news-b].", known);
    expect(r.text).toBe("NVDA rose [1]. KRE fell [2][1]. Again [1].");
    expect(r.sources.map((s) => s.id)).toEqual(["news-b", "news-a"]);
  });

  it("handles comma-joined ids", () => {
    expect(numberCitations("Fell [src:news-a, src:news-b].", known).text).toBe("Fell [1][2].");
  });

  it("drops ids no tool returned", () => {
    const r = numberCitations("A claim [src:made-up] here.", known);
    expect(r.text).toBe("A claim here.");
    expect(r.sources).toEqual([]);
  });
});

describe("briefEmail", () => {
  it("falls back to the numbers when the analysis failed", () => {
    const { subject, body } = briefEmail({ sessionDate: "2026-09-22", facts: "Fund return: +0.4%", analysis: null, sources: [], failure: "model timed out", appUrl: "https://x.app/" });
    expect(subject).toBe("Hoot's daily attribution: 2026-09-22");
    expect(body).toMatch(/^Hi all,\n\nMy analysis of Tuesday, September 22 didn't finish \(model timed out\)/);
    expect(body).toContain("https://x.app/attribution");
    expect(body.endsWith("Best,\nHoot")).toBe(true);
  });

  it("opens with the analysis and signs off as Hoot", () => {
    const { body } = briefEmail({ sessionDate: "2026-09-22", facts: "Fund return: +0.4%", analysis: "The fund beat the S&P 500.", sources: [] });
    expect(body).toBe("Hi all,\n\nHere's what drove the fund on Tuesday, September 22.\n\nThe fund beat the S&P 500.\n\nThe numbers, close to close:\n\nFund return: +0.4%\n\nBest,\nHoot");
  });

  it("lists sources in the footer", () => {
    expect(sourcesFooter([src("news-a", "KRE falls")])).toBe("Sources:\n[1] KRE falls (Reuters, 2026-09-22) https://example.com/news-a");
  });
});

describe("cleanBrief", () => {
  it("keeps only the tagged brief and strips Markdown", () => {
    const raw = "Now I have enough. Let me compile.\n\n<brief>\n**Daily brief**\n\nThe fund fell.\n\n- **AXP (-9 bps)**: rates.\n</brief>";
    expect(cleanBrief(raw)).toBe("Daily brief\n\nThe fund fell.\n\n- AXP (-9 bps): rates.");
  });

  it("drops a greeting and sign-off the model wrote itself", () => {
    expect(cleanBrief("Hi all,\n\nThe fund fell.\n\nBest, Hoot")).toBe("The fund fell.");
    expect(cleanBrief("The fund fell.\n\nBest,\nHoot")).toBe("The fund fell.");
  });

  it("uses the whole text when there are no tags", () => {
    expect(cleanBrief("## Brief\nThe fund rose.\n---\nDone.")).toBe("Brief\nThe fund rose.\n\nDone.");
  });
});
