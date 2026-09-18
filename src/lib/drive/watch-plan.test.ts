import { describe, expect, it } from "vitest";
import { LAZY_SYNC_WITHOUT_WATCH_MS, LAZY_SYNC_WITH_WATCH_MS, lazySyncMaxAge, watchNeedsRenewal } from "./watch-plan";

const now = new Date("2025-03-01T12:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3600_000);

describe("watchNeedsRenewal", () => {
  it("renews when there is no channel or it has expired", () => {
    expect(watchNeedsRenewal({ channelId: null, channelExpiration: null }, now)).toBe(true);
    expect(watchNeedsRenewal({ channelId: "c", channelExpiration: hours(-1) }, now)).toBe(true);
  });

  it("renews inside the lead window, not outside it", () => {
    expect(watchNeedsRenewal({ channelId: "c", channelExpiration: hours(12) }, now)).toBe(true);
    expect(watchNeedsRenewal({ channelId: "c", channelExpiration: hours(72) }, now)).toBe(false);
  });
});

describe("lazySyncMaxAge", () => {
  it("relaxes the poll while a channel is live", () => {
    expect(lazySyncMaxAge({ channelId: "c", channelExpiration: hours(48) }, now)).toBe(LAZY_SYNC_WITH_WATCH_MS);
    expect(lazySyncMaxAge({ channelId: "c", channelExpiration: hours(-1) }, now)).toBe(LAZY_SYNC_WITHOUT_WATCH_MS);
    expect(lazySyncMaxAge({ channelId: null, channelExpiration: null }, now)).toBe(LAZY_SYNC_WITHOUT_WATCH_MS);
  });
});
