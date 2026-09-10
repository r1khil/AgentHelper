import { describe, it, expect } from "vitest";
import { calculate, deadline, calendarFrom } from "../src/lib/movement";
import { observation, calendar, FIXTURE_DAY } from "../src/lib/fixtures";
describe("Closing movement rule", () => {
  it.each([
    ["105", "100.7", "4.3", true],
    ["96.5", "100.8", "-4.3", true],
    ["104", "100", "4", true],
    ["96", "100", "-4", true],
    ["103.9", "100", "3.9", false],
    ["96.1", "100", "-3.9", false],
  ])("compares %s vs %s inclusively", (price, spx, relative, qualifies) => {
    expect(
      calculate(
        observation("SYNTH:THC", price),
        observation("SPX", spx),
        calendar.session(FIXTURE_DAY),
      ),
    ).toMatchObject({ relativeMove: relative, qualifies });
  });
  it("requires actual SPX", () =>
    expect(() =>
      calculate(
        observation("X", "105"),
        observation("SPY", "100"),
        calendar.session(FIXTURE_DAY),
      ),
    ).toThrow("Actual SPX"));
  it.each([
    { official: false },
    { corporateAction: "ambiguous" },
    { observedAt: "2026-09-10T15:55:00-04:00" },
    { value: "NaN" },
    { value: "-1" },
    { previousClose: "0" },
    { session: "2026-09-09" },
    { currency: "EUR" },
  ])("rejects unsafe inputs %o", (patch) =>
    expect(() =>
      calculate(
        { ...observation("X", "105"), ...patch } as ReturnType<
          typeof observation
        >,
        observation("SPX", "100"),
        calendar.session(FIXTURE_DAY),
      ),
    ).toThrow(),
  );
  it("rejects missing benchmark", () =>
    expect(() =>
      calculate(observation("X", "105"), null, calendar.session(FIXTURE_DAY)),
    ).toThrow("missing"));
  it("rejects timestamps individually within tolerance but mutually misaligned", () =>
    expect(() =>
      calculate(
        { ...observation("X", "105"), observedAt: "2026-09-10T15:59:00-04:00" },
        {
          ...observation("SPX", "100"),
          observedAt: "2026-09-10T16:01:00-04:00",
        },
        calendar.session(FIXTURE_DAY),
      ),
    ).toThrow("timestamps"));
  it("handles the Labor Day gap and noon Eastern", () =>
    expect(deadline("2026-09-04", calendar).due.toISOString()).toBe(
      "2026-09-08T16:00:00.000Z",
    ));
  it("handles daylight-saving transition", () =>
    expect(deadline("2026-03-06", calendar).due.toISOString()).toBe(
      "2026-03-09T16:00:00.000Z",
    ));
  it("validates an early close", () =>
    expect(
      calculate(
        observation("X", "105", "100", "2026-11-27"),
        observation("SPX", "100", "100", "2026-11-27"),
        calendar.session("2026-11-27"),
      ).qualifies,
    ).toBe(true));
  it("does not invent missing calendar days", () =>
    expect(() => deadline("2026-11-30", calendar)).toThrow("not configured"));
  it("sorts calendar sessions", () =>
    expect(
      calendarFrom([
        { day: "2026-09-11", close: "" },
        { day: "2026-09-10", close: "" },
      ]).next("2026-09-09")?.day,
    ).toBe("2026-09-10"));
});
