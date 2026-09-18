import { timingSafeEqual } from "node:crypto";

/** The stored channel a notification must match. */
export type ChannelRecord = { channelId: string | null; channelSecret: string | null } | null;
export type HeaderReader = { get(name: string): string | null };

export type Verification = { ok: true; state: string; messageNumber: string | null } | { ok: false; status: number; reason: string };

function equal(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Pure check of Google's push headers against the channel we registered. The per-channel token is the only auth. */
export function verifyChannelHeaders(headers: HeaderReader, conn: ChannelRecord): Verification {
  const channelId = headers.get("x-goog-channel-id");
  const token = headers.get("x-goog-channel-token");
  const state = headers.get("x-goog-resource-state");
  if (!channelId || !token || !state) return { ok: false, status: 400, reason: "missing channel headers" };
  if (!conn?.channelId || !conn.channelSecret) return { ok: false, status: 403, reason: "no active channel" };
  if (!equal(channelId, conn.channelId)) return { ok: false, status: 403, reason: "unknown channel" };
  if (!equal(token, conn.channelSecret)) return { ok: false, status: 403, reason: "bad channel token" };
  return { ok: true, state, messageNumber: headers.get("x-goog-message-number") };
}
