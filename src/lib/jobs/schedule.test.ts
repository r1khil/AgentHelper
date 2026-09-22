import { describe, expect, it } from "vitest";
import { slotSkipReason } from "./schedule";

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
