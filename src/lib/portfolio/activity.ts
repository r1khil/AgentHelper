import { fmtChangeMoney, fmtDate, fmtMoney, fmtNumber, fmtUsd } from "@/lib/format";

// Pure: the ledger's tables (trades and cash) and the reinvested dividends, as one history for Activity. Nothing here
// reads the database, so the grouping, wording and totals are testable.

export type TradeIn = { id: string; date: string; ticker: string; side: "buy" | "sell"; kind: "opening" | "trade"; shares: number; price: number; fees: number; note: string | null; voided: boolean; createdAt: string; by: string | null };
export type FlowIn = { id: string; date: string; kind: "deposit" | "withdrawal" | "fee" | "interest"; amount: number; note: string | null; voided: boolean; createdAt: string; by: string | null };
/** A dividend the ledger reinvested itself: the shares it bought and the close it bought them at. */
export type DividendIn = { date: string; ticker: string; shares: number; price: number };

export type EntryType = "trades" | "cash" | "dividends";
export const ENTRY_FILTERS = ["All", "Trades", "Cash", "Dividends"] as const;
export type EntryFilter = (typeof ENTRY_FILTERS)[number];

export type ActivityEntry = {
  id: string;
  date: string;
  type: EntryType;
  /** The badge letter: B(uy), S(ell), O(pening), $ (cash), D(ividend). */
  letter: "B" | "S" | "O" | "$" | "D";
  title: string;
  meta: string;
  /** Already formatted; null for none. */
  amount: string | null;
  tone: "up" | "down" | null;
  voided: boolean;
  /** The row can be voided: which table it lives in and how the confirmation names it. */
  voidable: { table: "trade" | "cash"; id: string; entry: string } | null;
  /** The opening snapshot's own lines, shown when it is opened. */
  lines?: ActivityEntry[];
  /** Within a day: trades and cash first (newest recorded first), then reinvested dividends, then the opening snapshot. */
  rank: 0 | 1 | 2;
  /** When it was recorded (ISO), for newest first among equals. */
  recorded: string;
};

export type ActivityDay = { date: string; entries: ActivityEntry[] };

const CASH_TITLES = { deposit: "Deposit", withdrawal: "Withdrawal", fee: "Account fee", interest: "Interest" } as const;
const isTicket = (note: string | null) => !!note && /^Trade ticket/i.test(note);
const by = (name: string | null) => (name ? ` · ${name}` : "");

function tone(n: number): ActivityEntry["tone"] {
  return n > 0 ? "up" : n < 0 ? "down" : null;
}

function tradeEntry(t: TradeIn): ActivityEntry {
  const value = t.shares * t.price;
  const signed = t.side === "buy" ? -value : value;
  const source = isTicket(t.note) ? `Trade ticket (.docx)${by(t.by)}` : `Manual${by(t.by)}${t.note ? ` · ${t.note}` : ""}`;
  return {
    id: `trade:${t.id}`,
    date: t.date,
    type: "trades",
    letter: t.side === "buy" ? "B" : "S",
    title: `${t.side === "buy" ? "Bought" : "Sold"} ${fmtNumber(t.shares)} ${t.ticker} at ${fmtMoney(t.price)}`,
    meta: `${source}${t.fees ? ` · fees ${fmtMoney(t.fees)}` : ""}`,
    amount: t.side === "buy" ? fmtMoney(signed) : fmtChangeMoney(signed),
    tone: tone(signed),
    voided: t.voided,
    voidable: t.voided ? null : { table: "trade", id: t.id, entry: `${t.side === "buy" ? "BUY" : "SELL"} ${fmtNumber(t.shares)} ${t.ticker} @ ${fmtMoney(t.price)} on ${fmtDate(t.date)}` },
    rank: 0,
    recorded: t.createdAt,
  };
}

function flowEntry(f: FlowIn): ActivityEntry {
  const inflow = f.kind === "deposit" || f.kind === "interest";
  const signed = inflow ? f.amount : -f.amount;
  const counts = f.kind === "deposit" || f.kind === "withdrawal" ? "not counted as performance" : "counts as performance";
  return {
    id: `cash:${f.id}`,
    date: f.date,
    type: "cash",
    letter: "$",
    title: CASH_TITLES[f.kind],
    meta: `Cash movement${by(f.by)} · ${counts}${f.note ? ` · ${f.note}` : ""}`,
    amount: fmtChangeMoney(signed),
    tone: tone(signed),
    voided: f.voided,
    voidable: f.voided ? null : { table: "cash", id: f.id, entry: `the ${CASH_TITLES[f.kind].toLowerCase()} of ${fmtUsd(f.amount)} on ${fmtDate(f.date)}` },
    rank: 0,
    recorded: f.createdAt,
  };
}

/**
 * The opening snapshot is one entry: the positions and the opening cash the ledger started from, on the date it
 * opened. Its lines are the individual rows, each with its own void.
 */
function openingEntry(date: string, trades: TradeIn[], flows: FlowIn[]): ActivityEntry {
  const live = trades.filter((t) => !t.voided);
  const liveFlows = flows.filter((f) => !f.voided);
  const value = live.reduce((s, t) => s + t.shares * t.price, 0) + liveFlows.reduce((s, f) => s + f.amount, 0);
  const lines: ActivityEntry[] = [
    ...trades.map(
      (t): ActivityEntry => ({
        id: `trade:${t.id}`,
        date,
        type: "trades",
        letter: "O",
        title: `Opening position · ${t.ticker}`,
        meta: `${fmtNumber(t.shares)} shares at ${fmtMoney(t.price)}`,
        amount: fmtMoney(t.shares * t.price),
        tone: null,
        voided: t.voided,
        voidable: t.voided ? null : { table: "trade", id: t.id, entry: `the opening position of ${fmtNumber(t.shares)} ${t.ticker} @ ${fmtMoney(t.price)} on ${fmtDate(date)}` },
        rank: 2,
        recorded: t.createdAt,
      }),
    ),
    ...flows.map((f): ActivityEntry => ({ ...flowEntry(f), letter: "O", title: "Opening cash", meta: f.note ?? "Opening balance", type: "trades", tone: null, amount: fmtMoney(f.amount) })),
  ];
  const holdings = live.length;
  const all = live.length === 0 && liveFlows.length === 0;
  return {
    id: `opening:${date}`,
    date,
    type: "trades",
    letter: "O",
    title: all ? "Opening snapshot" : `Ledger opened · ${holdings} ${holdings === 1 ? "holding" : "holdings"}${liveFlows.length ? " and cash" : ""}`,
    meta: "Opening snapshot at the close",
    amount: all ? null : fmtMoney(value),
    tone: null,
    voided: all,
    voidable: null,
    lines,
    rank: 2,
    recorded: trades[0]?.createdAt ?? "",
  };
}

/** Everything the ledger has, newest day first, the opening snapshot as one entry, voided rows kept and marked. */
export function buildActivity(input: { trades: TradeIn[]; flows: FlowIn[]; dividends: DividendIn[] }): ActivityDay[] {
  const openingTrades = input.trades.filter((t) => t.kind === "opening");
  const openingDates = new Set(openingTrades.map((t) => t.date));
  // The opening cash is the deposit noted "Opening balance" on an opening date.
  const isOpeningFlow = (f: FlowIn) => f.note === "Opening balance" && openingDates.has(f.date);

  const entries: ActivityEntry[] = [];
  for (const date of openingDates) {
    entries.push(
      openingEntry(
        date,
        openingTrades.filter((t) => t.date === date),
        input.flows.filter((f) => isOpeningFlow(f) && f.date === date),
      ),
    );
  }
  for (const t of input.trades) if (t.kind !== "opening") entries.push(tradeEntry(t));
  for (const f of input.flows) if (!isOpeningFlow(f)) entries.push(flowEntry(f));
  for (const d of input.dividends) {
    entries.push({
      id: `dividend:${d.date}:${d.ticker}`,
      date: d.date,
      type: "dividends",
      letter: "D",
      title: `Dividend reinvested · ${d.ticker}`,
      meta: `${fmtNumber(d.shares, 2)} shares at ${fmtMoney(d.price)} · automatic on the ex-date`,
      amount: "Reinvested",
      tone: null,
      voided: false,
      voidable: null,
      rank: 1,
      recorded: "",
    });
  }

  const byDay = new Map<string, ActivityEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, entries: list.sort((a, b) => a.rank - b.rank || b.recorded.localeCompare(a.recorded) || a.title.localeCompare(b.title)) }));
}

export type ActivitySummary = { since: string | null; trades: number; bought: number; sold: number; deposits: number; dividends: number };

/** The totals over the recorded (not voided) entries, for the line above the history. */
export function summarizeActivity(input: { trades: TradeIn[]; flows: FlowIn[]; dividends: DividendIn[] }, since: string | null): ActivitySummary {
  const live = input.trades.filter((t) => !t.voided && t.kind === "trade");
  // The same opening cash buildActivity folds into the snapshot: "Opening balance" on an opening date.
  const openingDates = new Set(input.trades.filter((t) => t.kind === "opening").map((t) => t.date));
  return {
    since,
    trades: live.length,
    bought: live.filter((t) => t.side === "buy").reduce((s, t) => s + t.shares * t.price, 0),
    sold: live.filter((t) => t.side === "sell").reduce((s, t) => s + t.shares * t.price, 0),
    deposits: input.flows.filter((f) => !f.voided && !(f.note === "Opening balance" && openingDates.has(f.date))).reduce((s, f) => s + (f.kind === "deposit" ? f.amount : f.kind === "withdrawal" ? -f.amount : 0), 0),
    dividends: input.dividends.length,
  };
}
