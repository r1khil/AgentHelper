import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Source } from "@/lib/providers/types";
import type { AttributionSummary } from "@/lib/attribution/summary";
import { briefAlertEmail, briefEmail, chooseAnalysis, cleanBrief, numberCitations, researchView, sourcesFooter, type AnalysisRun } from "./daily-brief-format";

// Dates this year print without the year ("Tue, Sep 22"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

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
    expect(subject).toBe("Owl Fund Daily Attribution Analysis (Sep 22, 2026)");
    expect(body).toMatch(/^Hi all,\n\nMy analysis of Tue, Sep 22 didn't finish \(model timed out\)/);
    expect(body).toContain("https://x.app/attribution");
    expect(body.endsWith("Best,\nHoot")).toBe(true);
  });

  it("opens with the analysis and signs off as Hoot", () => {
    const { body } = briefEmail({ sessionDate: "2026-09-22", facts: "Fund return: +0.4%", analysis: "The fund beat the S&P 500.", sources: [] });
    expect(body).toBe("Hi all,\n\nHere's what drove the fund on Tue, Sep 22.\n\nThe fund beat the S&P 500.\n\nThe numbers, close to close:\n\nFund return: +0.4%\n\nFeel free to reply with any questions.\n\nBest,\nHoot");
  });

  it("lists sources in the footer", () => {
    expect(sourcesFooter([src("news-a", "KRE falls")])).toBe("Sources:\n[1] KRE falls (Reuters, Sep 22, 2026) https://example.com/news-a");
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

describe("chooseAnalysis", () => {
  const current = { hash: "h-now", facts: "Fund return: -0.29%" };

  it("uses the newest analysis written from exactly these numbers", () => {
    const runs: AnalysisRun[] = [
      { status: "ok", summaryHash: "h-now", analysis: "newest" },
      { status: "ok", summaryHash: "h-now", analysis: "older" },
    ];
    expect(chooseAnalysis(runs, current)).toMatchObject({ analysis: { analysis: "newest" }, reason: "", attempts: 2 });
  });

  it("never uses an analysis written from other numbers", () => {
    expect(chooseAnalysis([{ status: "ok", summaryHash: "h-5pm", analysis: "stale" }], current)).toEqual({ analysis: null, reason: "the numbers changed after it was written", attempts: 0 });
  });

  it("matches runs from before the hash by their facts text", () => {
    expect(chooseAnalysis([{ status: "ok", facts: "Fund return: -0.29%", analysis: "old run" }], current).analysis?.analysis).toBe("old run");
    expect(chooseAnalysis([{ status: "ok", facts: "Fund return: -0.31%", analysis: "old run" }], current).analysis).toBeNull();
  });

  it("explains why there is none and counts the tries for these numbers", () => {
    const runs: AnalysisRun[] = [
      { status: "failed", summaryHash: "h-now", reason: "model timed out" },
      { status: "ok", summaryHash: "h-5pm", analysis: "stale" },
    ];
    expect(chooseAnalysis(runs, current)).toEqual({ analysis: null, reason: "model timed out", attempts: 1 });
    expect(chooseAnalysis([{ status: "failed", reason: "closing prices for 2026-09-24 have not loaded" }], current).reason).toBe("closing prices for 2026-09-24 have not loaded");
    expect(chooseAnalysis([], current)).toEqual({ analysis: null, reason: "it did not run", attempts: 0 });
  });
});

describe("researchView", () => {
  it("lists every holding and sorts sectors, teams and holdings by contribution", () => {
    const row = (ticker: string, contributionBps: number) => ({ ticker, name: ticker, sector: null, team: null, avgWeightPct: 1, returnPct: 1, contributionBps });
    const summary = {
      scope: "Whole fund",
      headline: { returnPct: -0.29 },
      sectors: [
        { sector: "Health Care", contributionBps: -19 },
        { sector: "Communication Services", contributionBps: 27 },
        { sector: "Information Technology", contributionBps: -20 },
      ],
      teams: [
        { team: "Healthcare", contributionBps: -19 },
        { team: "Consumer & Communication Services", contributionBps: 23 },
      ],
      topContributors: [row("META", 18), row("GOOG", 6), row("TDIV", -7)],
      bottomContributors: [],
      dataNotices: [],
    } as unknown as AttributionSummary;
    const view = researchView(summary);
    expect(view.sectors.map((s) => s.sector)).toEqual(["Communication Services", "Health Care", "Information Technology"]);
    expect("teams" in view && view.teams?.map((t) => t.team)).toEqual(["Consumer & Communication Services", "Healthcare"]);
    expect(view.holdings.map((h) => h.ticker)).toEqual(["META", "GOOG", "TDIV"]);
    expect(view).not.toHaveProperty("topContributors");
    expect(view).not.toHaveProperty("bottomContributors");
  });
});

describe("briefAlertEmail", () => {
  it("says the brief is late, why, and how to send it by hand", () => {
    const { subject, body } = briefAlertEmail({ sessionDate: "2026-09-24", final: false, error: "OpenMail: 502 Application failed to respond", appUrl: "https://x.app/" });
    expect(subject).toBe("Daily attribution email not sent (Sep 24, 2026)");
    expect(body).toContain("The daily attribution email for Thu, Sep 24 hasn't gone out yet. I'll keep trying every 15 minutes until midnight New York time.");
    expect(body).toContain("What went wrong: OpenMail: 502 Application failed to respond");
    expect(body).toContain("https://x.app/admin");
    expect(body).toContain("to Sep 24, 2026");
  });

  it("says when the evening's retries ran out", () => {
    expect(briefAlertEmail({ sessionDate: "2026-09-24", final: true, error: "x" }).body).toContain("never went out");
  });
});
