import { describe, expect, it } from "vitest";
import { verifyChannelHeaders } from "./webhook-verify";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const conn = { channelId: "chan-1", channelSecret: "s".repeat(64) };
const good = { "x-goog-channel-id": "chan-1", "x-goog-channel-token": "s".repeat(64), "x-goog-resource-state": "change", "x-goog-message-number": "7" };

describe("verifyChannelHeaders", () => {
  it("accepts a matching channel and token", () => {
    expect(verifyChannelHeaders(headers(good), conn)).toEqual({ ok: true, state: "change", messageNumber: "7" });
  });

  it("rejects missing headers with 400", () => {
    expect(verifyChannelHeaders(headers({}), conn)).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects when no channel is stored, a different channel, or a wrong token", () => {
    expect(verifyChannelHeaders(headers(good), null)).toMatchObject({ ok: false, status: 403 });
    expect(verifyChannelHeaders(headers({ ...good, "x-goog-channel-id": "other" }), conn)).toMatchObject({ ok: false, status: 403, reason: "unknown channel" });
    expect(verifyChannelHeaders(headers({ ...good, "x-goog-channel-token": "t".repeat(64) }), conn)).toMatchObject({ ok: false, status: 403, reason: "bad channel token" });
    expect(verifyChannelHeaders(headers({ ...good, "x-goog-channel-token": "short" }), conn)).toMatchObject({ ok: false, status: 403 });
  });
});
