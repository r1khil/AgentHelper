import { describe, expect, it } from "vitest";
import { dirClass, dueLabel, isOverdue, movementPill, overdueLabel, sessionShort } from "./format";
import { exceptionKind } from "../models/exception-kind";

describe("movement formatting", () => {
  const now = Date.parse("2026-09-27T16:00:00Z");

  it("labels overdue by days and hours, then hours and minutes", () => {
    expect(overdueLabel(new Date(now - 5 * 86_400_000 - 2 * 3_600_000 - 1000), now)).toBe("Overdue by 5d 2h");
    expect(overdueLabel(new Date(now - 86_400_000), now)).toBe("Overdue by 1d 0h");
    expect(overdueLabel(new Date(now - (2 * 60 + 41) * 60_000), now)).toBe("Overdue by 2h 41m");
    expect(overdueLabel(new Date(now - 5 * 60_000), now)).toBe("Overdue by 5m");
    expect(overdueLabel(null, now)).toBe("Overdue");
  });

  it("is overdue only while unfinished and past due", () => {
    const past = new Date(now - 1000);
    expect(isOverdue("open", past, now)).toBe(true);
    expect(isOverdue("completed", past, now)).toBe(false);
    expect(isOverdue("in_progress", null, now)).toBe(false);
  });

  it("maps status to a word: red only when overdue", () => {
    expect(movementPill("in_progress", true)).toEqual({ tone: "hoot", label: "Overdue" });
    expect(movementPill("completed", false).tone).toBe("good");
    expect(movementPill("in_progress", false).tone).toBe("neutral");
    expect(movementPill("open", false).tone).toBe("neutral");
  });

  it("formats session and due dates", () => {
    expect(sessionShort("2026-09-22", new Date(now))).toBe("Tue, Sep 22");
    expect(sessionShort("2025-09-22", new Date(now))).toBe("Sep 22, 2025");
    expect(dueLabel(new Date("2026-09-23T16:00:00Z"), new Date(now))).toBe("Wed, Sep 23, 12:00 PM ET");
    expect(dueLabel(null)).toBe("—");
  });

  it("colours a signed figure by the sign at the precision shown", () => {
    expect(dirClass(-430)).toBe("text-down");
    expect(dirClass(460)).toBe("text-up");
    expect(dirClass(0.2)).toBe("text-muted-foreground");
    expect(dirClass(null)).toBe("text-muted-foreground");
  });
});

describe("model exception labels", () => {
  it("shortens the reasons from buildProposals", () => {
    expect(exceptionKind("Restated: 1 (10-Q filed x) vs 2. Latest filing used")).toBe("Restated");
    expect(exceptionKind("Only a year-to-date value ends 2026-06-30 (..)")).toBe("YTD only");
    expect(exceptionKind("Concept Foo is not reported by this company")).toBe("Not reported");
    expect(exceptionKind("No quarterly fact ending 2026-12-31; found 2 prior quarters in the fiscal year (need 3 to derive Q4)")).toBe("Q4 not derivable");
    expect(exceptionKind("No instant fact ending 2026-06-30")).toBe("No fact");
    expect(exceptionKind(null)).toBe("Exception");
  });
});
