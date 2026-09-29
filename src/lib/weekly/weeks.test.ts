import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {

  agendaWeek,
  isFriday,
  isValidIsoDate,
  lastFriday,
  packTitle,
  previousWeekEnding,
  priceWindow,
  reviewWeek,
  upcomingFriday,
  weekRangeLabel,
  weekdayLabel,
} from "./weeks";

// Dates this year print without the year ("Tue, Sep 22"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("lastFriday", () => {
  it("returns the Friday that just passed from any day of the week", () => {
    expect(lastFriday("2026-09-20")).toBe("2026-09-18"); // Sunday, when the job runs
    expect(lastFriday("2026-09-19")).toBe("2026-09-18"); // Saturday
    expect(lastFriday("2026-09-18")).toBe("2026-09-18"); // the Friday itself
    expect(lastFriday("2026-09-21")).toBe("2026-09-18"); // Monday
    expect(lastFriday("2026-09-17")).toBe("2026-09-11"); // Thursday
  });

  it("rejects a date it cannot read", () => {
    expect(() => lastFriday("not-a-date")).toThrow();
  });
});

describe("upcomingFriday", () => {
  it("returns the Friday on or after the day", () => {
    expect(upcomingFriday("2026-09-20")).toBe("2026-09-25");
    expect(upcomingFriday("2026-09-25")).toBe("2026-09-25");
    expect(upcomingFriday("2026-09-26")).toBe("2026-10-02");
  });
});

describe("isFriday / isValidIsoDate", () => {
  it("accepts only real ISO Fridays", () => {
    expect(isFriday("2026-09-18")).toBe(true);
    expect(isFriday("2026-09-17")).toBe(false);
    expect(isFriday("2026-09-31")).toBe(false);
    expect(isFriday("18-09-2026")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });
});

describe("priceWindow", () => {
  it("is Monday close to Friday close when every session traded", () => {
    expect(priceWindow("2026-09-18")).toEqual({ start: "2026-09-14", end: "2026-09-18" });
  });

  it("rolls Good Friday back to Thursday", () => {
    expect(priceWindow("2026-04-03")).toEqual({ start: "2026-03-30", end: "2026-04-02" });
  });

  it("rolls a Monday holiday forward to Tuesday", () => {
    // 2026-09-07 is Labor Day.
    expect(priceWindow("2026-09-11")).toEqual({ start: "2026-09-08", end: "2026-09-11" });
  });

  it("ignores a holiday that falls mid-week", () => {
    // 2026-07-03 is the observed Independence Day closure; the window that ends 07-10 starts 07-06.
    expect(priceWindow("2026-07-10")).toEqual({ start: "2026-07-06", end: "2026-07-10" });
  });

  it("refuses a week ending that is not a Friday", () => {
    expect(() => priceWindow("2026-09-17")).toThrow(/Friday/);
  });
});

describe("agendaWeek / reviewWeek / previousWeekEnding", () => {
  it("looks forward to the coming Monday-to-Friday", () => {
    expect(agendaWeek("2026-09-18")).toEqual({ from: "2026-09-21", to: "2026-09-25" });
  });

  it("looks back at the week that just ended", () => {
    expect(reviewWeek("2026-09-18")).toEqual({ from: "2026-09-14", to: "2026-09-18" });
  });

  it("steps back one pack", () => {
    expect(previousWeekEnding("2026-09-18")).toBe("2026-09-11");
  });
});

describe("labels", () => {
  it("names weekdays and the pack", () => {
    expect(weekdayLabel("2026-09-21")).toBe("Monday");
    expect(weekdayLabel("nope")).toBe("");
    expect(packTitle("2026-09-18")).toBe("Update for the week ended September 18th, 2026");
    expect(packTitle("2026-10-02")).toBe("Update for the week ended October 2nd, 2026");
    expect(packTitle("2026-09-11")).toBe("Update for the week ended September 11th, 2026");
    expect(packTitle("2026-10-23")).toBe("Update for the week ended October 23rd, 2026");
  });

  it("writes a week range, collapsing a shared month", () => {
    expect(weekRangeLabel("2026-09-21", "2026-09-25")).toBe("Mon, Sep 21 – Fri, Sep 25");
    expect(weekRangeLabel("2026-09-28", "2026-10-02")).toBe("Mon, Sep 28 – Fri, Oct 2");
  });
});
