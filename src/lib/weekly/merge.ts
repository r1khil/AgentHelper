import type { AgendaItem } from "./types";

/** Last resort when a mail client sends HTML only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export type ReplyItems = { recipientEmail: string; parsedItems: AgendaItem[] | null };

/** Every reply's items, in recipient order, with exact duplicates dropped. */
export function combineReplyItems(requests: ReplyItems[]): AgendaItem[] {
  const seen = new Set<string>();
  const out: AgendaItem[] = [];
  for (const r of [...requests].sort((a, b) => a.recipientEmail.localeCompare(b.recipientEmail))) {
    for (const item of r.parsedItems ?? []) {
      const key = `${item.day ?? ""}|${item.text.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * Replies only overwrite Process Updates while the pack is still the agent's to fill: a pack marked
 * sent, or one an exec edited after the newest reply, keeps what the exec wrote.
 */
export function shouldHoldReplies(pack: { status: "draft" | "sent"; editedAt: Date | null }, newestReplyAt: Date): boolean {
  if (pack.status === "sent") return true;
  return pack.editedAt !== null && pack.editedAt > newestReplyAt;
}
