// Trade tickets pasted into a Hoot chat: what Hoot's confirm card shows and what Confirm reports. Pure; the reading
// and ledger checks are in ./ticket-record.ts (checkPastedTickets).
import { recordable, type TicketRead, type TradeTicket } from "./ticket";
import { describeTrade } from "@/lib/email/ticket-mail";
import type { ProposedTrade } from "@/lib/hoot/proposals";

export type PastedTicketCheck = {
  /** Every ticket read, with the ledger's skip reasons and any price warning. */
  reads: TicketRead[];
  /** Readable, not skipped, and priced near that day's close: what Confirm records. */
  ready: TradeTicket[];
  /** Priced more than 5% from that day's close: left for the Ledger page, where someone sees the warning first. */
  held: TicketRead[];
};

/** A price far from the close is held, as for an emailed ticket: nobody would see the warning before it went in. */
export function splitHeld(checked: TicketRead[]): PastedTicketCheck {
  const held = checked.filter((r) => r.ticket && !r.skip && r.priceGap !== undefined);
  return { reads: checked, ready: recordable(checked.filter((r) => !held.includes(r))), held };
}

export const HELD_REASON = "The price is far from that day's close. Check it, then record it from the Ledger page.";

/** One line per ticket for the card: what it is and whether Confirm records it. */
export function proposedTrades(check: PastedTicketCheck): ProposedTrade[] {
  return check.reads.map((r): ProposedTrade => {
    if (!r.ticket) return { line: r.file, status: "unreadable", reason: r.errors[0] };
    const line = describeTrade(r.ticket);
    const warnings = r.warnings.length ? r.warnings : undefined;
    if (r.skip) return { line, status: "skip", reason: r.skip, warnings };
    if (check.held.includes(r)) return { line, status: "held", reason: HELD_REASON, warnings };
    return { line, status: "record", warnings };
  });
}

const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;

/** "Recorded 2 trades in the ledger. Held 1 ticket …": what happened to pasted tickets, or what would. */
export function pastedTicketsSummary(check: PastedTicketCheck, recorded: number | null): string {
  const lines = proposedTrades(check);
  const count = (s: ProposedTrade["status"]) => lines.filter((l) => l.status === s).length;
  const held = count("held");
  return [
    recorded === null ? (check.ready.length ? `Record ${n(check.ready.length, "trade")} in the ledger.` : null) : recorded ? `Recorded ${n(recorded, "trade")} in the ledger.` : null,
    held ? `${recorded === null ? "Hold" : "Held"} ${n(held, "ticket")} whose price is far from that day's close; record ${held === 1 ? "it" : "them"} from the Ledger page after checking.` : null,
    count("skip") ? `${recorded === null ? "Skip" : "Skipped"} ${n(count("skip"), "ticket")} already counted (in the ledger, in its opening holdings, or pasted twice).` : null,
    count("unreadable") ? `Couldn't read ${n(count("unreadable"), "ticket")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
