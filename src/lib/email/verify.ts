import { dkimVerify } from "mailauth/lib/dkim/verify";
import type { DNSResolver } from "mailauth";
import { bareAddress, FUND_DOMAIN } from "./inbound";

/**
 * Whether an inbound email provably came from the fund address it claims. theowlfund.com publishes no SPF or
 * DMARC record, so nothing upstream rejects a forged From; its Google Workspace DKIM key is the proof. Needed
 * wherever an email changes something (recording trades), not for questions, which only read.
 */
export type SenderCheck = { ok: true } | { ok: false; reason: string };

export async function verifyFundSender(raw: Buffer | string, claimedFrom: string, opts: { resolver?: DNSResolver } = {}): Promise<SenderCheck> {
  let res;
  try {
    res = await dkimVerify(raw, opts.resolver ? { resolver: opts.resolver } : undefined);
  } catch (e) {
    return { ok: false, reason: `could not check the signature (${e instanceof Error ? e.message : String(e)})` };
  }
  // One From address, and the same one the webhook reported.
  if (res.headerFrom.length !== 1 || bareAddress(res.headerFrom[0]) !== bareAddress(claimedFrom)) return { ok: false, reason: "the From header does not match the sender" };
  const signed = res.results.find(
    // underSized: an l= tag left part of the body (where attachments live) unsigned, so something could be appended.
    (r) => r.status.result === "pass" && r.signingDomain?.toLowerCase() === FUND_DOMAIN && !r.status.underSized,
  );
  if (signed) return { ok: true };
  const seen = res.results.map((r) => `${r.signingDomain || "?"}=${r.status.result}`).join(", ");
  return { ok: false, reason: `no valid ${FUND_DOMAIN} DKIM signature${seen ? ` (${seen})` : ""}` };
}
