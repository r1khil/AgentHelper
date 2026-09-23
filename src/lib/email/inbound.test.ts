import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { answerBody, bareAddress, firstName, isAutoReply, newReplyText, receiptBody, replyRecipients, verifyOpenMailSignature } from "./inbound";

describe("verifyOpenMailSignature", () => {
  const secret = "whsec_test";
  const rawBody = '{"event":"message.received"}';
  const now = 1_790_000_000_000;
  const ts = String(now / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");

  it("accepts a correct, fresh signature", () => {
    expect(verifyOpenMailSignature({ rawBody, timestamp: ts, signature: sig, secret, now })).toBe(true);
  });

  it("rejects a wrong secret, a changed body, or a stale timestamp", () => {
    expect(verifyOpenMailSignature({ rawBody, timestamp: ts, signature: sig, secret: "other", now })).toBe(false);
    expect(verifyOpenMailSignature({ rawBody: rawBody + " ", timestamp: ts, signature: sig, secret, now })).toBe(false);
    expect(verifyOpenMailSignature({ rawBody, timestamp: ts, signature: sig, secret, now: now + 301_000 })).toBe(false);
    expect(verifyOpenMailSignature({ rawBody, timestamp: null, signature: sig, secret, now })).toBe(false);
  });
});

describe("newReplyText", () => {
  it("drops the quoted thread under a Gmail reply", () => {
    const body = "Why did AXP underperform the sector?\n\nThanks,\nSaad\n\nOn Tue, Sep 22, 2026 at 9:10 PM Hoot (The Owl Fund) <\nhoot@omail.sh> wrote:\n\n> Hi all,\n> Here's what drove the fund";
    expect(newReplyText(body)).toBe("Why did AXP underperform the sector?\n\nThanks,\nSaad");
  });

  it("drops an Outlook header block", () => {
    const body = "What was cash drag?\n\nFrom: Hoot <hoot@omail.sh>\nSent: Tuesday\nSubject: Owl Fund";
    expect(newReplyText(body)).toBe("What was cash drag?");
  });
});

describe("replyRecipients", () => {
  it("replies to the asker and keeps fund addresses they copied, never Hoot or outsiders", () => {
    const r = replyRecipients(
      { id: "m", from: "Saad Quddus <SQuddus@theowlfund.com>", to: "hoot@omail.sh", cc: ["apatil@theowlfund.com", "friend@gmail.com", "rsharma@theowlfund.com", "squddus@theowlfund.com"] },
      "hoot@omail.sh",
    );
    expect(r).toEqual({ to: "squddus@theowlfund.com", cc: ["apatil@theowlfund.com", "rsharma@theowlfund.com"] });
  });
});

describe("small helpers", () => {
  it("parses names, addresses and auto-replies", () => {
    expect(bareAddress("Max <MSchmieder@theowlfund.com>")).toBe("mschmieder@theowlfund.com");
    expect(firstName("Saad Quddus", "x")).toBe("Saad");
    expect(firstName(null, "apatil@theowlfund.com")).toBe("Apatil");
    expect(isAutoReply("Automatic reply: Owl Fund", "")).toBe(true);
    expect(isAutoReply("Re: Owl Fund Daily Attribution Analysis", "Why AXP?")).toBe(false);
  });

  it("writes the receipt and answer as emails from Hoot", () => {
    expect(receiptBody("Saad")).toBe("Hi Saad,\n\nGot your question. I'm looking into it now and will reply here shortly.\n\nBest,\nHoot");
    expect(answerBody({ name: "Saad", answer: "AXP fell with the sector [1].", sourcesFooter: "Sources:\n[1] X" })).toBe("Hi Saad,\n\nAXP fell with the sector [1].\n\nSources:\n[1] X\n\nBest,\nHoot");
  });
});
