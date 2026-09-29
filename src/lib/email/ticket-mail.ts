import { NOT_A_TICKET, UNREADABLE_DOCX, type TicketRead, type TradeTicket } from "@/lib/attribution/ticket";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";

/** An attachment on an OpenMail `message.received` event. */
export type InboundAttachment = { filename: string; contentType?: string; sizeBytes?: number; url?: string; parsedText?: string; extractionMethod?: string };

/** At most this many tickets are read from one email, the same cap as the upload on the Portfolio's Activity view. */
export const MAX_EMAIL_TICKETS = 15;

/** Word attachments, the only kind a trade ticket comes in. */
export function docxAttachments(attachments: InboundAttachment[] | undefined): InboundAttachment[] {
  return (attachments ?? []).filter((a) => /\.docx$/i.test(a.filename ?? "")).slice(0, MAX_EMAIL_TICKETS);
}

/**
 * Whether a read attachment was meant as a ticket. A memo or pitch attached to a question is not, so the email
 * goes on to be answered; a ticket with a typo is, so the exec hears what to fix.
 */
export function isTicketAttempt(r: TicketRead): boolean {
  if (r.ticket) return true;
  const first = r.errors[0];
  if (first === NOT_A_TICKET || first === UNREADABLE_DOCX) return /trade ticket/i.test(r.file);
  return r.errors.length > 0;
}

/**
 * A ticket pasted into the body of an email or a forward. Starts at the "Action (Buy, Sell):" line so the
 * forward's own "Date:" header, which comes first, is never read as the trade date. Quote markers are dropped.
 */
export function ticketTextInBody(body: string | undefined): string | null {
  const lines = (body ?? "").replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/^\s*(>\s?)+/, ""));
  const start = lines.findIndex((l) => /^\s*Action\s*(\([^)]*\))?\s*:/i.test(l));
  if (start < 0) return null;
  const text = lines.slice(start).join("\n");
  const labels = ["equity", "price", "number of shares"].filter((l) => new RegExp(`^\\s*${l}\\b[^:\\n]{0,30}:`, "im").test(text));
  return labels.length >= 2 ? text : null;
}


function niceDate(iso: string): string {
  return fmtDate(iso);
}

/** "Bought 83 SYK (Stryker Corp) at $280.13 on 18 Sep 2026". */
export function describeTrade(t: TradeTicket): string {
  return `${t.side === "buy" ? "Bought" : "Sold"} ${fmtNumber(t.shares, 6)} ${t.ticker}${t.name ? ` (${t.name})` : ""} at ${fmtCurrency(t.price, "USD", { maxDigits: 4 })} on ${niceDate(t.date)}`;
}

/** What happened to an email's tickets: recorded (with any warnings), skipped, unreadable, or the import's error. */
export type TicketOutcome = {
  reads: TicketRead[];
  /** Readable tickets not recorded because nobody confirmed a warning that the upload dialog would have shown. */
  held?: TicketRead[];
  /** Set when recording was attempted: whether it went in, and the import's error or cash warning. */
  recorded: { ok: true; warning?: string } | { ok: false; error: string } | null;
};

/** The body of Hoot's reply after reading the tickets in an email. */
export function ticketReplyBody(opts: { name: string; outcome: TicketOutcome; ledgerUrl?: string }): string {
  const { reads, recorded, held = [] } = opts.outcome;
  const ready = reads.filter((r) => r.ticket && !r.skip);
  const skipped = reads.filter((r) => r.ticket && r.skip);
  const unreadable = reads.filter((r) => !r.ticket);
  const out: string[] = [`Hi ${opts.name},`, ""];

  if (recorded?.ok) {
    out.push(`I recorded ${ready.length === 1 ? "this trade" : `these ${ready.length} trades`} in the ledger:`, ...ready.map((r) => `- ${describeTrade(r.ticket!)}`));
    const warned = ready.filter((r) => r.warnings.length);
    if (warned.length) out.push("", "Please double-check:", ...warned.flatMap((r) => r.warnings.map((w) => `- ${r.ticket!.ticker}: ${w}`)));
    if (recorded.warning) out.push("", recorded.warning);
  } else if (recorded && !recorded.ok) {
    out.push(`I couldn't record ${ready.length === 1 ? "this ticket" : "these tickets"}, so nothing was added to the ledger:`, ...ready.map((r) => `- ${describeTrade(r.ticket!)}`), "", `The problem: ${recorded.error}`);
  } else {
    out.push("Nothing new went into the ledger from this email.");
  }

  if (held.length) {
    out.push(
      "",
      `I held back ${held.length === 1 ? "this ticket" : "these tickets"} because the price looks off:`,
      ...held.map((r) => `- ${describeTrade(r.ticket!)}: ${r.warnings.at(-1)}`),
      "",
      `If the ticket has a typo, fix it and send it again. If the price is right, upload the ticket on the Portfolio's Activity view${opts.ledgerUrl ? ` (${opts.ledgerUrl})` : ""}, where you can confirm it.`,
    );
  }
  if (skipped.length) out.push("", "Already recorded, so I left these alone:", ...skipped.map((r) => `- ${describeTrade(r.ticket!)}: ${r.skip}`));
  if (unreadable.length) {
    out.push("", "I couldn't read these tickets:", ...unreadable.map((r) => `- ${r.file}: ${r.errors.join(" ")}`), "", "Fix them and send them again. Tickets already in the ledger are skipped, so resending the whole set is safe.");
  }
  if (opts.ledgerUrl && recorded?.ok) out.push("", `If something is wrong, void the trade on the Portfolio's Activity view: ${opts.ledgerUrl}`);
  out.push("", "Best,", "Hoot");
  return out.join("\n");
}

/** Hoot's reply when someone who can't change the ledger sends a ticket. */
export function ticketNotAllowedBody(opts: { name: string; reason: "role" | "not signed in" | "unverified" }): string {
  const why = {
    role: "Only execs and admins can record trades, so I didn't add this ticket to the ledger. Forward it to an exec and they can send it to me.",
    "not signed in": "I can only record trades for people who have signed in to the Owl Fund app. Sign in once, then send the ticket again.",
    unverified:
      "I couldn't confirm this email came from your Owl Fund account, so I didn't record anything. Send the ticket from your theowlfund.com address in Gmail, or upload it on the Portfolio's Activity view. If you didn't send it, let an admin know.",
  }[opts.reason];
  return [`Hi ${opts.name},`, "", why, "", "Best,", "Hoot"].join("\n");
}
