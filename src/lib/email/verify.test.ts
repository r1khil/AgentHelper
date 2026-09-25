import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dkimSign } from "mailauth/lib/dkim/sign";
import { verifyFundSender } from "./verify";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const p = publicKey.export({ type: "spki", format: "der" }).toString("base64");
/** Stands in for DNS: only google._domainkey of the two test domains has a key. */
const resolver = async (name: string) => {
  if (name === "google._domainkey.theowlfund.com" || name === "google._domainkey.evil.example") return [[`v=DKIM1; k=rsa; p=${p}`]];
  const err = new Error("not found") as Error & { code: string };
  err.code = "ENOTFOUND";
  throw err;
};

const message = (from: string, body = "Ticket attached.") =>
  [`From: Saad Quddus <${from}>`, "To: hoot@omail.sh", "Subject: SYK ticket", "Date: Fri, 25 Sep 2026 16:00:00 -0400", "Message-ID: <t1@theowlfund.com>", "", body, ""].join("\r\n");

async function signed(msg: string, domain: string, extra: { maxBodyLength?: number } = {}) {
  const r = await dkimSign(msg, { signatureData: [{ signingDomain: domain, selector: "google", privateKey: pem, ...extra }] } as never);
  return r.signatures + msg;
}

describe("verifyFundSender", () => {
  it("accepts mail signed by theowlfund.com from the address the webhook reported", async () => {
    const raw = await signed(message("squddus@theowlfund.com"), "theowlfund.com");
    expect(await verifyFundSender(raw, "SQuddus@theowlfund.com", { resolver })).toEqual({ ok: true });
  });

  it("rejects an unsigned email that only claims a fund address", async () => {
    const r = await verifyFundSender(message("squddus@theowlfund.com"), "squddus@theowlfund.com", { resolver });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/no valid theowlfund.com DKIM signature/) });
  });

  it("rejects a valid signature from another domain", async () => {
    const raw = await signed(message("squddus@theowlfund.com"), "evil.example");
    expect((await verifyFundSender(raw, "squddus@theowlfund.com", { resolver })).ok).toBe(false);
  });

  it("rejects a body changed after signing", async () => {
    const raw = (await signed(message("squddus@theowlfund.com"), "theowlfund.com")).replace("Ticket attached.", "Buy 10,000 SYK.");
    expect((await verifyFundSender(raw, "squddus@theowlfund.com", { resolver })).ok).toBe(false);
  });

  it("rejects a signature that leaves part of the body unsigned", async () => {
    const raw = await signed(message("squddus@theowlfund.com", "Hi\r\nMore text that the l= tag leaves out"), "theowlfund.com", { maxBodyLength: 4 });
    expect((await verifyFundSender(raw, "squddus@theowlfund.com", { resolver })).ok).toBe(false);
  });

  it("rejects when the signed From differs from the webhook's sender", async () => {
    const raw = await signed(message("rsharma@theowlfund.com"), "theowlfund.com");
    expect(await verifyFundSender(raw, "squddus@theowlfund.com", { resolver })).toEqual({ ok: false, reason: "the From header does not match the sender" });
  });
});
