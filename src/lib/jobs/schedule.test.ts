import { describe, expect, it } from "vitest";
import { briefIsLate, briefRetrySkipReason, isLastBriefTry, mayWaitForCloses, slotSkipReason } from "./schedule";

describe("the brief's evening retries", () => {
  it("act from 5:25 p.m. until midnight New York time, in daylight and standard time", () => {
    // EDT: 21:15 UTC is 17:15, 21:30 UTC is 17:30, 03:45 UTC is 23:45, 04:00 UTC is midnight.
    expect(briefRetrySkipReason(new Date("2026-09-24T21:15:00Z"))).toMatch(/from 17:25 New York time \(it is 17:15/);
    expect(briefRetrySkipReason(new Date("2026-09-24T21:30:00Z"))).toBeNull();
    expect(briefRetrySkipReason(new Date("2026-09-25T03:45:00Z"))).toBeNull();
    expect(briefRetrySkipReason(new Date("2026-09-25T04:00:00Z"))).toMatch(/it is 00:00/);
    // EST: 22:15 UTC is 17:15, 22:30 UTC is 17:30, 04:45 UTC is 23:45.
    expect(briefRetrySkipReason(new Date("2026-12-01T22:15:00Z"))).not.toBeNull();
    expect(briefRetrySkipReason(new Date("2026-12-01T22:30:00Z"))).toBeNull();
    expect(briefRetrySkipReason(new Date("2026-12-02T04:45:00Z"))).toBeNull();
  });

  it("hold for late closes until 6:30 p.m., count the brief late from 5:30 and end at 11:45", () => {
    expect(mayWaitForCloses(new Date("2026-09-24T22:15:00Z"))).toBe(true);
    expect(mayWaitForCloses(new Date("2026-09-24T22:30:00Z"))).toBe(false);
    expect(briefIsLate(new Date("2026-09-24T21:15:40Z"))).toBe(false);
    expect(briefIsLate(new Date("2026-09-24T21:30:02Z"))).toBe(true);
    expect(isLastBriefTry(new Date("2026-09-25T03:30:00Z"))).toBe(false);
    expect(isLastBriefTry(new Date("2026-09-25T03:45:05Z"))).toBe(true);
    expect(isLastBriefTry(new Date("2026-12-02T04:45:05Z"))).toBe(true);
  });
});

describe("slotSkipReason", () => {
  it("passes the call that lands on the New York slot in daylight time", () => {
    // 21:00 UTC on 2026-09-22 is 17:00 EDT.
    expect(slotSkipReason("17:00", new Date("2026-09-22T21:00:30Z"))).toBeNull();
    expect(slotSkipReason("17:05", new Date("2026-09-22T21:06:00Z"))).toBeNull();
  });

  it("skips the other daylight-saving hour", () => {
    // 22:00 UTC is 18:00 EDT.
    expect(slotSkipReason("17:00", new Date("2026-09-22T22:00:00Z"))).toMatch(/not the 17:00/);
    // In winter 21:00 UTC is 16:00 EST and 22:00 UTC is 17:00 EST.
    expect(slotSkipReason("17:00", new Date("2026-12-01T21:00:00Z"))).toMatch(/not the 17:00/);
    expect(slotSkipReason("17:15", new Date("2026-12-01T22:15:10Z"))).toBeNull();
  });

  it("allows a few minutes of scheduler delay but not an early call", () => {
    expect(slotSkipReason("17:15", new Date("2026-09-22T21:24:00Z"))).toBeNull();
    expect(slotSkipReason("17:15", new Date("2026-09-22T21:25:00Z"))).not.toBeNull();
    expect(slotSkipReason("17:15", new Date("2026-09-22T21:14:00Z"))).not.toBeNull();
  });

  it("does nothing for manual runs without a slot", () => {
    expect(slotSkipReason(null)).toBeNull();
  });
});
