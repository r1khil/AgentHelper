import { createHmac, timingSafeEqual } from "node:crypto";

/** The part of an OpenMail `message.received` webhook the app uses. */
export type InboundEvent = {
  event: string;
  event_id: string;
  inbox_id: string;
  thread_id: string;
  message: { id: string; from: string; to: string; cc?: string[]; subject?: string; body_text?: string };
};

/** Only the fund's own addresses ever receive a reply from Hoot. */
export const FUND_DOMAIN = "theowlfund.com";

/** OpenMail signs `${timestamp}.${rawBody}` with HMAC-SHA256; stale timestamps are replays. */
export function verifyOpenMailSignature(opts: { rawBody: string; timestamp: string | null; signature: string | null; secret: string; now?: number }): boolean {
  const { rawBody, timestamp, signature, secret } = opts;
  if (!timestamp || !signature || !/^[0-9a-f]+$/i.test(signature)) return false;
  const age = Math.abs((opts.now ?? Date.now()) / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "Saad Quddus <SQuddus@theowlfund.com>" → "squddus@theowlfund.com". */
export function bareAddress(s: string): string {
  const m = /<([^>]+)>/.exec(s);
  return (m ? m[1] : s).trim().toLowerCase();
}

export function isFundAddress(addr: string): boolean {
  return bareAddress(addr).endsWith(`@${FUND_DOMAIN}`);
}

/** Out-of-office and delivery notices must never start a conversation with Hoot. */
export function isAutoReply(subject: string | undefined, body: string | undefined): boolean {
  const s = (subject ?? "").toLowerCase();
  if (/^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|undeliverable|delivery status notification|mail delivery failed)/.test(s)) return true;
  return /^(i am|i'm) (currently )?out of (the )?office/i.test((body ?? "").trim());
}

/**
 * The new text of a reply, without the quoted thread under it: stops at the "On … wrote:" line Gmail and
 * Outlook add, an Outlook "From:" header block or "Original Message" divider, and skips ">" quote lines.
 */
export function newReplyText(body: string): string {
  const out: string[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    // Gmail can wrap the attribution over two lines: "On Tue, Sep 22, 2026 at 9:10 PM Hoot (The Owl Fund) <\nhoot@omail.sh> wrote:"
    const joined = `${t} ${lines[i + 1]?.trim() ?? ""}`;
    if (/^On .+ wrote:$/.test(t) || (/^On /.test(t) && /wrote:$/.test(joined))) break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(t) || /^_{5,}$/.test(t)) break;
    if (/^From: .+/.test(t) && /^(Sent|Date): /.test(lines[i + 1]?.trim() ?? "")) break;
    if (t.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** First name for the greeting, from a profile name or the address. */
export function firstName(fullName: string | null | undefined, address: string): string {
  const n = fullName?.trim().split(/\s+/)[0];
  if (n) return n;
  const local = bareAddress(address).split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Who Hoot's reply goes to: the asker in To, then everyone else they copied at the fund, never Hoot itself. */
export function replyRecipients(msg: InboundEvent["message"], hootAddress: string): { to: string; cc: string[] } {
  const from = bareAddress(msg.from);
  const hoot = bareAddress(hootAddress);
  const others = [msg.to, ...(msg.cc ?? [])]
    .flatMap((s) => s.split(","))
    .map(bareAddress)
    .filter((a) => a && a !== from && a !== hoot && isFundAddress(a));
  return { to: from, cc: [...new Set(others)] };
}

export function receiptBody(name: string): string {
  return [`Hi ${name},`, "", "Got your question. I'm looking into it now and will reply here shortly.", "", "Best,", "Hoot"].join("\n");
}

export function answerBody(opts: { name: string; answer: string; sourcesFooter: string }): string {
  return [`Hi ${opts.name},`, "", opts.answer, ...(opts.sourcesFooter ? ["", opts.sourcesFooter] : []), "", "Best,", "Hoot"].join("\n");
}

export function failureBody(opts: { name: string; reason: string; appUrl?: string }): string {
  const app = opts.appUrl ? ` You can also ask me in the app: ${opts.appUrl.replace(/\/$/, "")}/hoot` : "";
  return [`Hi ${opts.name},`, "", `Sorry, I couldn't finish an answer to this one (${opts.reason}). Reply again to have me retry.${app}`, "", "Best,", "Hoot"].join("\n");
}
