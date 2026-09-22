import { describe, expect, it } from "vitest";
import { matchReplyAddress, readWebhookHeaders, replyAddress, stripQuotedReply } from "./inbound";

describe("replyAddress / matchReplyAddress", () => {
  const address = replyAddress("2026-09-18", "a1b2c3d4e5f60718", "inbound.theowlfund.com");

  it("round-trips the week and token", () => {
    expect(address).toBe("weekly+2026-09-18-a1b2c3d4e5f60718@inbound.theowlfund.com");
    expect(matchReplyAddress([address])).toEqual({ weekEnding: "2026-09-18", token: "a1b2c3d4e5f60718", domain: "inbound.theowlfund.com" });
  });

  it("finds the token in any of the reported addresses, display name and all", () => {
    expect(matchReplyAddress(["Aadi Patil <apatil@theowlfund.com>", null, `The Owl's Nest <${address}>`])?.token).toBe("a1b2c3d4e5f60718");
  });

  it("rejects another domain when one is required, and malformed tokens", () => {
    expect(matchReplyAddress([address], "inbound.example.com")).toBe(null);
    expect(matchReplyAddress([address], "INBOUND.THEOWLFUND.COM")?.token).toBe("a1b2c3d4e5f60718");
    expect(matchReplyAddress(["weekly+2026-09-18-short@inbound.theowlfund.com"])).toBe(null);
    expect(matchReplyAddress(["weekly+18-09-2026-a1b2c3d4e5f60718@inbound.theowlfund.com"])).toBe(null);
    expect(matchReplyAddress(["apatil@theowlfund.com"])).toBe(null);
    expect(matchReplyAddress([])).toBe(null);
  });
});

describe("stripQuotedReply", () => {
  it("keeps only what the exec typed above a Gmail quote", () => {
    const body = [
      "Monday: Stock pitch dry run",
      "Wednesday: Model review",
      "",
      "On Sun, Sep 20, 2026 at 9:02 AM The Owl's Nest <weekly@inbound.theowlfund.com> wrote:",
      "> The weekly pack for the week ended September 18, 2026 is built.",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("Monday: Stock pitch dry run\nWednesday: Model review");
  });

  it("handles Gmail's two-line attribution", () => {
    const body = ["Tuesday: Sector handoff", "", "On Sun, Sep 20, 2026 at 9:02 AM The Owl's Nest", "<weekly@inbound.theowlfund.com> wrote:", "> quoted"].join("\n");
    expect(stripQuotedReply(body)).toBe("Tuesday: Sector handoff");
  });

  it("handles the Outlook original-message divider and From: block", () => {
    const outlook = ["Thursday: Pitch practice", "", "-----Original Message-----", "From: The Owl's Nest", "Sent: Sunday"].join("\n");
    expect(stripQuotedReply(outlook)).toBe("Thursday: Pitch practice");
    const fromBlock = ["Friday: Retro", "", "From: The Owl's Nest <weekly@inbound.theowlfund.com>", "Sent: Sunday, September 20, 2026"].join("\n");
    expect(stripQuotedReply(fromBlock)).toBe("Friday: Retro");
  });

  it("drops a signature and a mobile footer", () => {
    expect(stripQuotedReply("Monday: Dry run\n\n--\nAadi Patil\nCIO")).toBe("Monday: Dry run");
    expect(stripQuotedReply("Monday: Dry run\n\nSent from my iPhone")).toBe("Monday: Dry run");
  });

  it("is empty for nothing, or for a quote-only reply", () => {
    expect(stripQuotedReply(null)).toBe("");
    expect(stripQuotedReply("> only a quote")).toBe("");
  });
});

describe("readWebhookHeaders", () => {
  it("accepts svix-* and webhook-* spellings", () => {
    const svix = new Headers({ "svix-id": "msg_1", "svix-timestamp": "1750000000", "svix-signature": "v1,abc" });
    expect(readWebhookHeaders(svix)).toEqual({ id: "msg_1", timestamp: "1750000000", signature: "v1,abc" });
    const webhook = new Headers({ "webhook-id": "msg_2", "webhook-timestamp": "1750000001", "webhook-signature": "v1,def" });
    expect(readWebhookHeaders(webhook)?.id).toBe("msg_2");
  });

  it("is null when a header is missing", () => {
    expect(readWebhookHeaders(new Headers({ "svix-id": "msg_1" }))).toBe(null);
  });
});
