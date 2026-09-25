import { describe, expect, it } from "vitest";
import { DeliveryError, EmailNotSentError, isRetryableStatus, parseRetryAfter, sendWithFailover, stableKey, withRetries } from "./delivery";

const noWait = async () => {};

describe("withRetries", () => {
  it("retries retryable failures after the given waits and reports the tries", async () => {
    const waits: number[] = [];
    let n = 0;
    const r = await withRetries(
      async () => {
        if (++n < 3) throw new DeliveryError("502 Application failed to respond", { retryable: true });
        return "msg-1";
      },
      { delaysMs: [2_000, 8_000], wait: async (ms) => void waits.push(ms) },
    );
    expect(r).toEqual({ value: "msg-1", tries: 3 });
    expect(waits).toEqual([2_000, 8_000]);
  });

  it("gives up after the last wait", async () => {
    let n = 0;
    const send = async () => {
      n++;
      throw new DeliveryError("no response", { retryable: true });
    };
    await expect(withRetries(send, { delaysMs: [1, 1], wait: noWait })).rejects.toMatchObject({ message: "no response", tries: 3 });
    expect(n).toBe(3);
  });

  it("does not repeat a failure that will not change", async () => {
    let n = 0;
    const refused = async () => {
      n++;
      throw new DeliveryError("403 recipient not permitted", { retryable: false });
    };
    await expect(withRetries(refused, { delaysMs: [1, 1], wait: noWait })).rejects.toMatchObject({ tries: 1 });
    expect(n).toBe(1);
    // A plain error is a bug, not a provider's answer.
    await expect(withRetries(async () => Promise.reject(new Error("boom")), { delaysMs: [1], wait: noWait })).rejects.toMatchObject({ tries: 1 });
  });

  it("waits out a short Retry-After but not a quota that resets hours later", async () => {
    const waits: number[] = [];
    let n = 0;
    const burst = async () => {
      if (++n === 1) throw new DeliveryError("429 Max 10 sends per minute per inbox", { retryable: true, retryAfterMs: 12_000 });
      return "msg-2";
    };
    await expect(withRetries(burst, { delaysMs: [2_000], wait: async (ms) => void waits.push(ms) })).resolves.toEqual({ value: "msg-2", tries: 2 });
    expect(waits).toEqual([12_000]);
    const daily = async () => Promise.reject(new DeliveryError("429 daily limit", { retryable: true, retryAfterMs: 3_600_000 }));
    await expect(withRetries(daily, { delaysMs: [2_000], maxWaitMs: 20_000, wait: noWait })).rejects.toMatchObject({ tries: 1 });
  });
});

describe("sendWithFailover", () => {
  it("moves to the next provider when one fails and keeps every outcome", async () => {
    const r = await sendWithFailover([
      { name: "OpenMail", send: async () => Promise.reject(Object.assign(new Error("inbox lookup failed: 502 Application failed to respond"), { tries: 3 })) },
      { name: "Gmail", send: async () => ({ value: "<gmail-id>", tries: 1 }) },
      { name: "Resend", send: async () => Promise.reject(new Error("should not be tried")) },
    ]);
    expect(r.provider).toBe("Gmail");
    expect(r.value).toBe("<gmail-id>");
    expect(r.attempts).toEqual([
      { provider: "OpenMail", ok: false, tries: 3, error: "inbox lookup failed: 502 Application failed to respond" },
      { provider: "Gmail", ok: true, tries: 1 },
    ]);
  });

  it("lists every provider's error when none can send", async () => {
    const e = await sendWithFailover([
      { name: "OpenMail", send: async () => Promise.reject(new Error("502 Application failed to respond")) },
      { name: "Gmail", send: async () => Promise.reject(new Error("Invalid login")) },
    ]).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EmailNotSentError);
    expect((e as EmailNotSentError).message).toBe("OpenMail: 502 Application failed to respond; Gmail: Invalid login");
    expect((e as EmailNotSentError).attempts.map((a) => a.provider)).toEqual(["OpenMail", "Gmail"]);
  });

  it("says email is not configured when there is no provider", async () => {
    await expect(sendWithFailover([])).rejects.toThrow("email is not configured");
  });
});

describe("helpers", () => {
  it("reads Retry-After as seconds or as a date", () => {
    expect(parseRetryAfter("12")).toBe(12_000);
    expect(parseRetryAfter("Thu, 24 Sep 2026 21:15:30 GMT", Date.parse("2026-09-24T21:15:00Z"))).toBe(30_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(" ")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });

  it("treats timeouts, rate limits and server errors as worth repeating", () => {
    expect([408, 429, 500, 502, 503, 504].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 402, 403, 404, 422].some(isRetryableStatus)).toBe(false);
  });

  it("gives the same email the same UUID-shaped key and a changed email a new one", () => {
    const a = stableKey({ sessionDate: "2026-09-24", body: "Hi all" });
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(stableKey({ sessionDate: "2026-09-24", body: "Hi all" })).toBe(a);
    expect(stableKey({ sessionDate: "2026-09-24", body: "Hi all!" })).not.toBe(a);
  });
});
