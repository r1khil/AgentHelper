import { describe, expect, it } from "vitest";
import { sourceId } from "@/lib/providers/types";
import { listStatus, minutesLabel, pointTime, stamp, waveform } from "./timeline";

describe("sell-side timeline", () => {
  it("formats stamps and lengths", () => {
    expect(stamp(252)).toBe("04:12");
    expect(stamp(3852)).toBe("1:04:12");
    expect(minutesLabel(2520)).toBe("42 min");
    expect(minutesLabel(12)).toBe("<1 min");
  });

  it("places a point at the best-matching segment of the part it cites", () => {
    const parts = [
      { seq: 0, offset: "0", duration: "120", segments: [{ start: 0, end: 20, text: "Welcome everyone" }] },
      {
        seq: 1,
        offset: "120",
        duration: "120",
        segments: [
          { start: 120, end: 150, text: "Demand is fine" },
          { start: 150, end: 180, text: "CoWoS capacity reaches 95k wafers by 2027" },
        ],
      },
    ];
    const id = sourceId("call", "c1:1");
    expect(pointTime({ text: "CoWoS capacity of 95k wafers by 2027", sourceIds: [`[src:${id}]`] }, parts, "c1")).toBe(150);
    expect(pointTime({ text: "Unrelated", sourceIds: ["doc-1"] }, parts, "c1")).toBeNull();
  });

  it("draws a deterministic waveform with stubs for silence", () => {
    const segs = [
      { start: 0, end: 10, text: "a".repeat(200) },
      { start: 50, end: 60, text: "b".repeat(50) },
    ];
    const a = waveform(segs, 100, 10);
    expect(a).toEqual(waveform(segs, 100, 10));
    expect(a).toHaveLength(10);
    expect(a[2]).toBeCloseTo(0.12);
    expect(a[0]).toBeGreaterThan(a[5]);
    expect(waveform([], 100)).toEqual([]);
  });

  it("labels saved-call statuses", () => {
    expect(listStatus({ status: "transcribing", expectedParts: 25 }, { parts: 25, transcribed: 16, summarized: 0 }).label).toBe("Transcribing 64%");
    expect(listStatus({ status: "error", expectedParts: null }, { parts: 1, transcribed: 1, summarized: 0 })).toEqual({ label: "Needs retry", tone: "down" });
    expect(listStatus({ status: "recording", expectedParts: null }, { parts: 0, transcribed: 0, summarized: 0 }).label).toBe("Ready to record");
  });
});
