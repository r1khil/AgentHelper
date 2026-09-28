import { describe, expect, it } from "vitest";
import { applyEdits, editReplyText, parseEditPlan, weekFromReplySubject } from "./reply-edits";
import type { WeeklyAgenda, WeeklyFigures } from "./types";

const agenda: WeeklyAgenda = {
  earnings: [{ day: "Monday", text: "NKE" }, { day: "Monday", text: "CCL" }, { day: "Wednesday", text: "MU" }],
  marketNews: [{ day: "Tuesday", text: "Consumer Confidence" }, { day: "Wednesday", text: "Wholesale Trade" }, { day: "Friday", text: "Nonfarm Payrolls" }],
  processUpdates: [{ day: "Monday", text: "IT Follow-Up" }, { day: "Wednesday", text: "C&C Pitch" }, { day: "Wednesday", text: "FIG ICR Due" }],
};
const figures: WeeklyFigures = {
  aumK: { value: 4674.21, source: "sheet", ref: "D3" },
  ytdPct: { value: 6.34, source: "sheet", ref: "G6" },
  benchmarkYtdPct: { value: 12.9, source: "sheet", ref: "G8" },
};

describe("parseEditPlan", () => {
  it("keeps well-formed edits from a reply wrapped in prose or a code fence, and drops the rest", () => {
    const raw = 'Here you go:\n```json\n{"isEditRequest":true,"edits":[{"op":"remove","section":"marketNews","text":"Wholesale Trade"},{"op":"add","section":"earnings","text":"ORCL","day":"tue"},{"op":"explode","section":"earnings","text":"X"},{"op":"set_figure","figure":"aumK","value":"$4,650.1k"},{"op":"move","section":"nope","text":"IT Pitch","day":"Thursday"}],"unhandled":["swap META for TSM"]}\n```';
    const plan = parseEditPlan(raw);
    expect(plan.edits).toEqual([
      { op: "remove", section: "marketNews", text: "Wholesale Trade" },
      { op: "add", section: "earnings", text: "ORCL", day: "Tuesday" },
      { op: "set_figure", figure: "aumK", value: 4650.1 },
    ]);
    expect(plan.unhandled).toEqual(["swap META for TSM"]);
    expect(plan.isEditRequest).toBe(true);
  });

  it("reads a thank-you as no request, and throws on a reply with no JSON", () => {
    expect(parseEditPlan('{"isEditRequest":false,"edits":[],"unhandled":[]}')).toEqual({ edits: [], unhandled: [], isEditRequest: false });
    expect(() => parseEditPlan("Sure thing!")).toThrow();
  });
});

describe("applyEdits", () => {
  it("removes, adds, moves and renames, keeping each section in weekday order", () => {
    const r = applyEdits(agenda, figures, [
      { op: "remove", section: "marketNews", text: "wholesale trade" },
      { op: "add", section: "earnings", text: "ORCL", day: "Tuesday" },
      { op: "move", section: "processUpdates", text: "IT Follow-Up", day: "Thursday" },
      { op: "rename", section: "marketNews", text: "Consumer Confidence", to: "CB Consumer Confidence" },
    ]);
    expect(r.agenda.earnings.map((i) => `${i.text}:${i.day}`)).toEqual(["NKE:Monday", "CCL:Monday", "ORCL:Tuesday", "MU:Wednesday"]);
    expect(r.agenda.marketNews.map((i) => i.text)).toEqual(["CB Consumer Confidence", "Nonfarm Payrolls"]);
    expect(r.agenda.processUpdates.map((i) => `${i.text}:${i.day}`)).toEqual(["C&C Pitch:Wednesday", "FIG ICR Due:Wednesday", "IT Follow-Up:Thursday"]);
    expect(r.applied).toHaveLength(4);
    expect(r.skipped).toEqual([]);
  });

  it("says what it couldn't do instead of guessing", () => {
    const r = applyEdits(agenda, figures, [
      { op: "remove", section: "earnings", text: "AAPL" },
      { op: "add", section: "earnings", text: "nke", day: "Monday" },
      // "Pitch" alone matches only C&C Pitch; "Due" would match nothing uniquely.
      { op: "remove", section: "processUpdates", text: "Pitch" },
    ]);
    expect(r.skipped).toEqual(['Couldn\'t find "AAPL" in Earnings', "nke is already in Earnings"]);
    expect(r.applied).toEqual(["Removed C&C Pitch from Process Updates"]);
  });

  it("removes at most three items from a section per email", () => {
    const five: WeeklyAgenda = { ...agenda, earnings: ["NKE", "CCL", "MU", "JBL", "ACN"].map((text) => ({ day: "Monday", text })) };
    const r = applyEdits(five, figures, five.earnings.map((i) => ({ op: "remove" as const, section: "earnings" as const, text: i.text })));
    expect(r.agenda.earnings.map((i) => i.text)).toEqual(["JBL", "ACN"]);
    expect(r.skipped).toEqual([
      "Kept JBL: I remove at most 3 items from Earnings per email, so make bigger changes on the Weekly page",
      "Kept ACN: I remove at most 3 items from Earnings per email, so make bigger changes on the Weekly page",
    ]);
  });

  it("records a typed figure as an exec's entry", () => {
    const r = applyEdits(agenda, figures, [{ op: "set_figure", figure: "aumK", value: 4650.1 }]);
    expect(r.figures.aumK).toEqual({ value: 4650.1, source: "entered" });
    expect(r.figures.ytdPct).toEqual(figures.ytdPct);
  });
});

describe("editReplyText", () => {
  it("lists the changes and gives back the changed lines, ready to paste", () => {
    const result = applyEdits(agenda, figures, [{ op: "remove", section: "marketNews", text: "Wholesale Trade" }, { op: "remove", section: "earnings", text: "AAPL" }]);
    const text = editReplyText({ name: "Aadi", result, unhandled: ["swap META for TSM"] });
    expect(text).toContain("Hi Aadi,\n\nDone. I updated the pack:\n- Removed Wholesale Trade from Market News");
    expect(text).toContain('Not done:\n- Couldn\'t find "AAPL" in Earnings\n- I can\'t do this by email yet: swap META for TSM');
    expect(text).toContain("The updated lines, ready to paste:\n\nMarket News: Consumer Confidence (Tuesday), Nonfarm Payrolls (Friday)");
    expect(text).not.toContain("Earnings:");
  });
});

describe("weekFromReplySubject", () => {
  it("finds the week in a reply to the Sunday email and nothing else", () => {
    expect(weekFromReplySubject("Re: Weekly update data for the week ended 25 Sep 2026")).toBe("2026-09-25");
    expect(weekFromReplySubject("Re: Weekly update data for the week ended September 25, 2026")).toBe("2026-09-25");
    expect(weekFromReplySubject("Re: Weekly update data for the week ended 24 Sep 2026")).toBeNull();
    expect(weekFromReplySubject("RE: Weekly update data for the week ended October 2, 2026")).toBe("2026-10-02");
    expect(weekFromReplySubject("Re: Weekly update data for the week ended September 24, 2026")).toBeNull();
    expect(weekFromReplySubject("Re: Owl Fund Daily Attribution Analysis (25-Sep-2026)")).toBeNull();
  });
});
