import { describe, expect, it } from "vitest";
import { askEmailText, askSubject } from "./ask-text";

describe("askSubject", () => {
  it("names the week the updates are for, not the week that ended", () => {
    expect(askSubject("2026-09-18")).toBe("Process updates for the week of September 21–25, 2026");
  });
});

describe("askEmailText", () => {
  const items = [
    { day: "Monday", text: "Stock pitch dry run" },
    { day: "Wednesday", text: "Model review" },
  ];

  it("quotes last week one item per line and asks for the same shape back", () => {
    const text = askEmailText({ weekEnding: "2026-09-18", lastWeekProcessUpdates: items, packUrl: "https://example.com/weekly/2026-09-18" });
    expect(text).toContain("week ended September 18, 2026");
    expect(text).toContain("week of September 21–25, 2026");
    expect(text).toContain("Monday: Stock pitch dry run\nWednesday: Model review");
    expect(text).toContain("one line per item");
    expect(text).toContain("https://example.com/weekly/2026-09-18");
  });

  it("says so plainly when there is nothing to carry over, and omits a missing link", () => {
    const text = askEmailText({ weekEnding: "2026-09-18", lastWeekProcessUpdates: [], packUrl: null });
    expect(text).toContain("(none recorded)");
    expect(text).not.toContain("Open the pack");
  });

  it("proposes no process updates of its own", () => {
    const text = askEmailText({ weekEnding: "2026-09-18", lastWeekProcessUpdates: [], packUrl: null });
    // The only day-shaped lines are the empty placeholders that show the format.
    const dayLines = text.split("\n").filter((l) => /^(Monday|Tuesday|Wednesday|Thursday|Friday):/.test(l));
    expect(dayLines.every((l) => l.includes("<what is happening>"))).toBe(true);
  });
});
