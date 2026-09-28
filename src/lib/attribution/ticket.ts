import { IMPORT_COLUMNS, parseDate, parseNumber } from "./csv";
import { fmtUsd } from "@/lib/format";

/**
 * The Fund's Word trade ticket: one labeled line per field ("Price: $280.13"), then the sign-off block.
 * Only the first occurrence of each label counts, so the sign-off "Date:" lines never override the trade date.
 */
export type TradeTicket = {
  side: "buy" | "sell";
  name: string;
  ticker: string;
  date: string;
  time: string | null;
  shares: number;
  price: number;
  marketValue: number | null;
  percentOfPortfolio: number | null;
  semester: string | null;
  sector: string | null;
};

/** `ticket` is null when the file could not be read; `skip` says why a readable ticket is not recorded. */
export type TicketRead = {
  file: string;
  ticket: TradeTicket | null;
  errors: string[];
  warnings: string[];
  skip?: string;
  /** The ticket's price over that session's close, minus one, when it is far enough off to be a typo or a planned price. */
  priceGap?: number;
};

/** parseTicket's first error for a document with none of a ticket's labels, such as a memo attached to an email. */
export const NOT_A_TICKET = "This does not look like a trade ticket. Expected lines like “Action (Buy, Sell): Buy” and “Price: $98.19”.";

export const UNREADABLE_DOCX = "Could not open this Word file.";

const LABELS = {
  action: "action",
  equity: "equity",
  date: "date",
  price: "price",
  time: "time",
  "number of shares": "shares",
  "market value": "marketValue",
  "percent of portfolio": "percent",
  semester: "semester",
  sector: "sector",
} as const;
type Field = (typeof LABELS)[keyof typeof LABELS];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Labeled values, first occurrence wins. "Action (Buy, Sell):" is keyed as "action". */
export function ticketFields(text: string): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = /^([^:]{1,40}):(.*)$/.exec(raw.trim());
    if (!m) continue;
    const label = m[1].replace(/\([^)]*\)/g, "").trim().toLowerCase() as keyof typeof LABELS;
    const field = LABELS[label];
    if (field && out[field] === undefined) out[field] = m[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

/** Ticker and ISO date from a name like "Stryker Corp (SYK)_Trade Ticket (18-Sep-2026).docx". */
export function ticketFileHints(file: string): { ticker: string | null; date: string | null } {
  const ticker = /\(([A-Za-z0-9.\-]{1,10})\)_Trade Ticket/i.exec(file)?.[1]?.toUpperCase() ?? null;
  const d = /\((\d{1,2})-([A-Za-z]{3})-(\d{4})\)/.exec(file);
  const month = d ? MONTHS.indexOf(d[2].toLowerCase()) + 1 : 0;
  const date = d && month ? parseDate(`${d[3]}-${month}-${d[1]}`) : null;
  return { ticker, date };
}

export function parseTicket(text: string, file: string): TicketRead {
  const f = ticketFields(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  const done = (ticket: TradeTicket | null): TicketRead => ({ file, ticket: errors.length ? null : ticket, errors, warnings });

  if (!f.action && !f.equity && !f.price) {
    errors.push(NOT_A_TICKET);
    return done(null);
  }

  const action = (f.action ?? "").toLowerCase();
  const side = action === "buy" ? "buy" : action === "sell" ? "sell" : null;
  if (!side) errors.push(`Action must be Buy or Sell${f.action ? `, not “${f.action}”` : ""}.`);

  const equity = /^(.*?)\s*\(([A-Za-z0-9.\-]{1,10})\)$/.exec(f.equity ?? "");
  if (!equity) errors.push(`Equity must end with the ticker in brackets, like “Stryker Corp (SYK)”${f.equity ? `, not “${f.equity}”` : ""}.`);

  const date = parseDate(f.date ?? "");
  if (!date) errors.push(`Date must look like 9/18/2026${f.date ? `, not “${f.date}”` : ""}.`);

  const shares = parseNumber(f.shares);
  if (shares === undefined || !(shares > 0)) errors.push("Number of Shares must be a number above zero.");
  const price = parseNumber(f.price);
  if (price === undefined || !(price > 0)) errors.push("Price must be a number above zero.");

  const marketValue = parseNumber(f.marketValue);
  const percent = parseNumber((f.percent ?? "").replace(/%$/, ""));

  if (errors.length) return done(null);

  const ticket: TradeTicket = {
    side: side!,
    name: equity![1],
    ticker: equity![2].toUpperCase(),
    date: date!,
    time: f.time || null,
    shares: shares!,
    price: price!,
    marketValue: marketValue !== undefined && Number.isFinite(marketValue) ? marketValue : null,
    percentOfPortfolio: percent !== undefined && Number.isFinite(percent) ? percent : null,
    semester: f.semester || null,
    sector: f.sector || null,
  };

  if (ticket.marketValue !== null && Math.abs(ticket.shares * ticket.price - ticket.marketValue) > 1) {
    warnings.push(`Shares × price is ${fmtUsd(ticket.shares * ticket.price)}, but the ticket says ${fmtUsd(ticket.marketValue)}. One of them is a typo.`);
  }
  const hint = ticketFileHints(file);
  if (hint.ticker && hint.ticker !== ticket.ticker) warnings.push(`The file name says ${hint.ticker}, the ticket says ${ticket.ticker}.`);
  if (hint.date && hint.date !== ticket.date) warnings.push(`The file name says ${hint.date}, the ticket says ${ticket.date}.`);
  return done(ticket);
}

export function ticketNote(t: TradeTicket): string {
  return ["Trade ticket", t.time, t.semester, t.sector].filter(Boolean).join(" · ").slice(0, 500);
}

const tradeKey = (t: TradeTicket) => `${t.date}|${t.ticker}|${t.side}|${t.shares}|${t.price}`;

/** Marks a second copy of the same trade in one upload, so uploading a ticket twice records it once. */
export function markRepeats(reads: TicketRead[]): TicketRead[] {
  const seen = new Map<string, string>();
  return reads.map((r) => {
    if (!r.ticket) return r;
    const first = seen.get(tradeKey(r.ticket));
    if (!first) {
      seen.set(tradeKey(r.ticket), r.file);
      return r;
    }
    return { ...r, skip: `Same trade as ${first}, which is recorded once.` };
  });
}

/**
 * The ledger starts from opening holdings: every position as of that date, earlier trades included. A ticket dated
 * before them is already counted there, and recording it would count those shares twice.
 */
export function beforeOpening(ticketDate: string, openingDate: string | null): string | null {
  if (!openingDate || ticketDate >= openingDate) return null;
  return `Dated ${ticketDate}, before the ledger's opening holdings on ${openingDate}, which already include it.`;
}

/** Tickets to record: read, and not skipped. */
export function recordable(reads: TicketRead[]): TradeTicket[] {
  return reads.flatMap((r) => (r.ticket && !r.skip ? [r.ticket] : []));
}

/** The ledger CSV import format, one row per readable ticket, in the order given. */
export function ticketsToCsv(tickets: TradeTicket[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = tickets.map((t) => [t.date, t.side, t.ticker, String(t.shares), String(t.price), "", "", q(ticketNote(t))].join(","));
  return [IMPORT_COLUMNS.join(","), ...rows].join("\n");
}
