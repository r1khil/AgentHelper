import { describe, expect, it } from "vitest";
import { assembleIndexCloses, closedSessions, indexCloseLines } from "./index-closes";

const days = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
const bars = (closes: (number | null)[]) => closes.flatMap((close, i) => (close === null ? [] : [{ date: days[i], close }]));

describe("assembleIndexCloses", () => {
  it("fills the first source's gaps from the next and lays the week out for a sheet", () => {
    // The week ended 25 Sep 2026: CNBC has no SPXTR bar for the 23rd; Yahoo does.
    const data = assembleIndexCloses(days, {
      SPXTR: [bars([17411.859375, 17411.80078125, null, 17276.4609375, 17364.7890625]), bars([17411.8591, 17411.798, 17280.5098, 17276.4566, 17364.7874])],
      SVX: [bars([2302.5282, 2298.8126, 2287.811, 2280.9646, 2289.5305])],
      SGX: [bars([5782.11, 5789.5101, 5733.0153, 5744.262, 5779.7188])],
    });
    expect(data.problems).toEqual([]);
    expect(indexCloseLines(data)).toEqual([
      "Date\tSPXTR\tSVX\tSGX",
      "9/21/2026\t17,411.86\t2,302.53\t5,782.11",
      "9/22/2026\t17,411.80\t2,298.81\t5,789.51",
      "9/23/2026\t17,280.51\t2,287.81\t5,733.02",
      "9/24/2026\t17,276.46\t2,280.96\t5,744.26",
      "9/25/2026\t17,364.79\t2,289.53\t5,779.72",
    ]);
  });

  it("marks a missing day n/a and says what to check, naming any source that failed", () => {
    const data = assembleIndexCloses(days, {
      SPXTR: ["Yahoo: timed out", bars([1, 2, null, 4, 5])],
      SVX: ["CNBC: CNBC 503 for .SVX"],
      SGX: [bars([1, 2, null, 4, 5])],
    });
    expect(indexCloseLines(data)[3]).toBe("9/23/2026\tn/a\tn/a\tn/a");
    expect(data.problems).toEqual([
      "No SPXTR close for Wednesday 9/23 (Yahoo: timed out); take it from S&P's site.",
      "Couldn't get the SVX closes (CNBC: CNBC 503 for .SVX).",
      "No SGX close for Wednesday 9/23; take it from S&P's site.",
    ]);
  });
});

describe("closedSessions", () => {
  it("lists the week's sessions, skipping holidays and any that haven't closed", () => {
    expect(closedSessions("2026-09-25", "2026-09-29")).toEqual(days);
    expect(closedSessions("2026-10-02", "2026-09-30")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(closedSessions("2026-10-02", "2026-09-25")).toEqual([]);
    // Thanksgiving 2026 is Thursday 26 Nov.
    expect(closedSessions("2026-11-27", "2026-11-30")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-27"]);
  });
});
