import { ISO_DATE } from "./weeks";

/** The reply-to address we hand each exec: weekly+<week ending>-<token>@<inbound domain>. */
export function replyAddress(weekEnding: string, token: string, domain: string): string {
  return `weekly+${weekEnding}-${token}@${domain}`;
}

export type ReplyMatch = { weekEnding: string; token: string; domain: string };

const ADDRESS = /weekly\+(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]{8,64})@([A-Za-z0-9.-]+)/i;

/**
 * Find our token in any of the addresses Resend reports (`to`, `received_for`). Angle brackets and
 * display names are tolerated; a `domain` argument, when given, must match.
 */
export function matchReplyAddress(addresses: (string | null | undefined)[], domain?: string | null): ReplyMatch | null {
  for (const raw of addresses) {
    if (!raw) continue;
    const m = raw.match(ADDRESS);
    if (!m) continue;
    const [, weekEnding, token, found] = m;
    if (!ISO_DATE.test(weekEnding)) continue;
    if (domain && found.toLowerCase() !== domain.toLowerCase()) continue;
    return { weekEnding, token, domain: found.toLowerCase() };
  }
  return null;
}

const CUTS: RegExp[] = [
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^\s*_{10,}\s*$/,
  /^\s*On\b.*\bwrote:\s*$/,
  /^\s*On\b.*$(?=\n\s*.*\bwrote:\s*$)/m,
  /^\s*From:\s+\S.*$/,
  /^\s*Sent from my \w+/i,
];

/**
 * Keep only what the exec typed. Gmail's "On <date> <person> wrote:", Outlook's original-message
 * divider and From: block, quoted `>` lines and a `--` signature are all dropped.
 */
export function stripQuotedReply(text: string | null | undefined): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    if (/^\s*>/.test(line)) break;
    if (/^\s*--\s*$/.test(line)) break;
    if (CUTS.some((re) => re.test(line))) break;
    // Gmail wraps the attribution over two lines: "On <date>," / "<person> wrote:".
    if (/^\s*On\b/.test(line) && /\bwrote:\s*$/.test(next)) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export type WebhookHeaders = { id: string; timestamp: string; signature: string };

/** Resend signs with svix; the headers arrive as either `svix-*` or `webhook-*`. */
export function readWebhookHeaders(headers: Headers): WebhookHeaders | null {
  const pick = (a: string, b: string) => headers.get(a) ?? headers.get(b);
  const id = pick("svix-id", "webhook-id");
  const timestamp = pick("svix-timestamp", "webhook-timestamp");
  const signature = pick("svix-signature", "webhook-signature");
  if (!id || !timestamp || !signature) return null;
  return { id, timestamp, signature };
}
