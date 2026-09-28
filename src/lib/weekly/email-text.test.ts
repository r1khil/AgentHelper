import { describe, expect, it } from "vitest";
import { splitRecipients, parseRecipients, weeklyChecks, weeklyEmailSubject, weeklyEmailText, type WeeklyEmailInput } from "./email-text";
import { emptyAgenda } from "./types";

const input: WeeklyEmailInput = {
  weekEnding: "2026-09-25",
  figures: {
    aumK: { value: 4674.21, source: "sheet", ref: "D3" },
    ytdPct: { value: 6.34, source: "sheet", ref: "G6" },
    benchmarkYtdPct: { value: 12.9, source: "sheet", ref: "G8" },
  },
  performers: {
    top: [
      { ticker: "SOXX", name: "iShares Semiconductor ETF", pct: 7.2 },
      { ticker: "AVGO", name: "Broadcom Inc", pct: 4.4 },
      { ticker: "TSM", name: "Taiwan Semiconductor Manufacturing Co", pct: 3.1 },
    ],
    worst: [
      { ticker: "CI", name: "The Cigna Group", pct: -5.1 },
      { ticker: "AXP", name: "American Express Co", pct: -5.0 },
      { ticker: "EVR", name: "Evercore Inc", pct: -4.7 },
    ],
    missing: [],
    window: { start: "2026-09-21", end: "2026-09-25" },
    source: "sheet",
    checks: [],
  },
  agenda: {
    earnings: [{ day: "Tuesday", text: "AZO" }, { day: "Wednesday", text: "CTAS" }, { day: "Wednesday", text: "PAYX" }],
    marketNews: [{ day: "Friday", text: "Durable Goods" }],
    processUpdates: [],
  },
  lastWeekAgenda: { ...emptyAgenda(), processUpdates: [{ day: "Monday", text: "IT ICR Due" }, { day: "Friday", text: "C&C ICR Due" }] },
  sources: { sheet: { status: "ok", at: "2026-09-27T13:00:00Z" } },
  toName: "Aadi",
};

describe("weeklyEmailText", () => {
  const text = weeklyEmailText(input);

  it("lays the deck's sections out in its order and style", () => {
    expect(weeklyEmailSubject("2026-09-25")).toBe("Weekly update data for the week ended September 25, 2026");
    expect(text.startsWith("Hi Aadi,\n")).toBe(true);
    const order = ["PORTFOLIO HIGHLIGHTS", "TOP 3 PERFORMERS", "WORST 3 PERFORMERS", "LAST WEEK'S AGENDA", "THIS WEEK'S AGENDA", "YTD PERFORMANCE CHART", "CHECKS"].map((h) => text.indexOf(h));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
    expect(text).toContain("AUM: $4,674.2k\nYTD Return: 6.3%\nYTD Relative Return (vs SPXTR): (6.6%)");
    expect(text).toContain("The Cigna Group (CI): (5.1%)");
    expect(text).toContain("Earnings: AZO (Tuesday), CTAS, PAYX (Wednesday)");
  });

  it("leaves Process Updates to Aadi, with last week's for reference", () => {
    expect(text).toContain("Process Updates: (add this week's)\n\nLast week's process updates, for reference:\nMonday: IT ICR Due\nFriday: C&C ICR Due");
    const filled = weeklyEmailText({ ...input, agenda: { ...input.agenda, processUpdates: [{ day: "Monday", text: "IT Pitch" }] } });
    expect(filled).toContain("Process Updates: IT Pitch (Monday)");
    expect(filled).not.toContain("for reference");
  });

  it("says what is automatic, invites edits by reply, and adds Hoot's notes only when there are some", () => {
    expect(text).toContain("The numbers and lists are pulled automatically from the PT sheet, the fund calendar and market data. Reply with any changes");
    expect(text).not.toContain("WHY THEY MOVED");
    const why = [{ ticker: "SOXX", text: "Rose with chip stocks.", headline: "Chips rally", source: "Reuters", url: "https://example.com/1" }];
    const withWhy = weeklyEmailText({ ...input, performers: { ...input.performers!, why } });
    expect(withWhy).toContain(`The "Why they moved" lines are my AI read of the week's news.`);
    expect(withWhy).toContain("WHY THEY MOVED (HOOT'S READ OF THE NEWS, FOR CONTEXT, NOT FOR THE SLIDE)\nSOXX: Rose with chip stocks. (Reuters: https://example.com/1)\n\nLAST WEEK'S AGENDA");
  });

  it("says there is nothing to flag, where the numbers come from, and asks for a double check", () => {
    expect(text).toContain("CHECKS\nNothing to flag.");
    expect(text).toContain(`top and worst 3 from the PT sheet's "% 1 Week"`);
    expect(text).toContain("Please double check figures for accuracy.\n\nFeel free to reply");
    expect(text).not.toContain("http");
    expect(weeklyEmailText({ ...input, toName: null }).startsWith("Hi,\n")).toBe(true);
  });
});

describe("weeklyChecks", () => {
  it("flags failed build steps, missing or carried figures, and the performers' own notes", () => {
    const checks = weeklyChecks({
      figures: { ...input.figures, aumK: { value: null, source: "entered" }, ytdPct: { value: 6.8, source: "carried" } },
      performers: { ...input.performers!, missing: ["DRAM"], checks: ["AVGO: the sheet says 5.4% for the week, the app's closes say 4.4%."] },
      sources: { marketNews: { status: "failed", at: "x", error: "calendar down" }, email: { status: "failed", at: "x", error: "502" } },
    });
    expect(checks).toEqual([
      "Couldn't read Market News: calendar down.",
      "AUM is missing; take it from the PT sheet.",
      "The YTD return is last week's number; the PT sheet wasn't read, so check it.",
      "AVGO: the sheet says 5.4% for the week, the app's closes say 4.4%.",
      "No Monday and Friday closes for DRAM; they're left out of the top and worst 3.",
    ]);
  });
});

describe("recipients", () => {
  it("puts the first real address in To and the rest in CC, defaulting to Aadi and Saad", () => {
    expect(splitRecipients([])).toEqual({ to: "apatil@theowlfund.com", cc: ["squddus@theowlfund.com"], skipped: [] });
    expect(splitRecipients(parseRecipients(" A@x.com,\nb@x.com, a@x.com "))).toEqual({ to: "a@x.com", cc: ["b@x.com"], skipped: [] });
  });

  it("is paused when only test accounts are listed", () => {
    expect(splitRecipients(parseRecipients("test.exec@accounts.owlfund.local"))).toEqual({ to: null, cc: [], skipped: ["test.exec@accounts.owlfund.local"] });
  });
});
