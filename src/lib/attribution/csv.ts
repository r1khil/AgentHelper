import type { CashFlow, Trade } from "./types";

export const IMPORT_COLUMNS = ["date", "type", "ticker", "shares", "price", "amount", "fees", "note"] as const;
export const IMPORT_TYPES = ["opening", "buy", "sell", "deposit", "withdrawal", "fee", "interest"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_TEMPLATE = [
  IMPORT_COLUMNS.join(","),
  "2025-01-02,deposit,,,,1500000,,Opening cash balance",
  "2025-01-02,opening,MSFT,350,,,,Held at the start; price left blank uses that day's close",
  "2025-02-14,buy,NVDA,120,131.25,,4.95,",
  "2025-03-03,sell,MSFT,50,398.10,,,Trim",
  "2025-03-31,fee,,,,125.00,,Custody fee",
].join("\n");

export type ImportTradeRow = Trade & { line: number; kind: "opening" | "trade"; note: string | null; needsPrice: boolean };
export type ImportCashRow = CashFlow & { line: number; note: string | null };
export type ImportIssue = { line: number; message: string };

export type ParsedImport = {
  trades: ImportTradeRow[];
  cashFlows: ImportCashRow[];
  errors: ImportIssue[];
  rows: number;
};

/** RFC 4180-style split: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Accepts 2025-01-31 and 1/31/2025. */
export function parseDate(raw: string): string | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, m, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Accepts 1,234.50 and $1,234.50; blank is undefined; anything else is NaN. */
export function parseNumber(raw: string | undefined): number | undefined {
  const v = (raw ?? "").trim().replace(/[$,\s]/g, "");
  if (v === "") return undefined;
  return /^-?\d*\.?\d+$/.test(v) ? Number(v) : NaN;
}

const TICKER = /^[A-Z0-9.\-]{1,10}$/;

export function parseLedgerCsv(text: string, opts: { today: string; isTradingDay: (iso: string) => boolean; maxRows?: number }): ParsedImport {
  const out: ParsedImport = { trades: [], cashFlows: [], errors: [], rows: 0 };
  const table = splitCsv(text);
  if (!table.length) return { ...out, errors: [{ line: 1, message: "The file is empty." }] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof IMPORT_COLUMNS)[number], number>;
  const missing = (["date", "type"] as const).filter((c) => col[c] === -1);
  if (missing.length) return { ...out, errors: [{ line: 1, message: `The first row must name the columns. Missing: ${missing.join(", ")}. Expected ${IMPORT_COLUMNS.join(", ")}.` }] };

  const body = table.slice(1);
  out.rows = body.length;
  const max = opts.maxRows ?? 5000;
  if (body.length > max) return { ...out, errors: [{ line: 1, message: `The file has ${body.length} rows; the limit is ${max}. Split it into smaller files.` }] };

  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (c: (typeof IMPORT_COLUMNS)[number]) => (col[c] === -1 ? "" : (cells[col[c]] ?? "").trim());
    const fail = (message: string) => void out.errors.push({ line, message });

    const date = parseDate(get("date"));
    if (!date) return fail(`"${get("date")}" is not a date. Use YYYY-MM-DD or M/D/YYYY.`);
    if (date > opts.today) return fail(`${date} is in the future.`);

    const type = get("type").toLowerCase() as ImportType;
    if (!IMPORT_TYPES.includes(type)) return fail(`Unknown type "${get("type")}". Use ${IMPORT_TYPES.join(", ")}.`);
    const note = get("note").slice(0, 500) || null;

    if (type === "opening" || type === "buy" || type === "sell") {
      const ticker = get("ticker").toUpperCase();
      if (!TICKER.test(ticker)) return fail(`"${get("ticker")}" is not a ticker.`);
      if (!opts.isTradingDay(date)) return fail(`${date} is not a trading day.`);
      const shares = parseNumber(get("shares"));
      if (shares === undefined || !(shares > 0)) return fail("Shares must be a number above zero.");
      const price = parseNumber(get("price"));
      if (price !== undefined && !(price > 0)) return fail("Price must be a number above zero.");
      if (price === undefined && type !== "opening") return fail("Price is required for a buy or sell.");
      const fees = parseNumber(get("fees")) ?? 0;
      if (!(fees >= 0)) return fail("Fees must be zero or more.");
      out.trades.push({ line, date, ticker, side: type === "sell" ? "sell" : "buy", kind: type === "opening" ? "opening" : "trade", shares, price: price ?? 0, fees, note, needsPrice: price === undefined });
    } else {
      const amount = parseNumber(get("amount"));
      if (amount === undefined || !(amount > 0)) return fail("Amount must be a number above zero. The type sets the direction.");
      out.cashFlows.push({ line, date, kind: type, amount, note });
    }
  });
  return out;
}

const tradeKey = (t: { date: string; ticker: string; side: string; shares: number; price: number }) => `${t.date}|${t.ticker}|${t.side}|${t.shares.toFixed(6)}|${t.price.toFixed(6)}`;
const flowKey = (f: { date: string; kind: string; amount: number }) => `${f.date}|${f.kind}|${f.amount.toFixed(2)}`;

/** Rows identical to something already in the ledger, so re-importing a file does not double it. */
export function splitDuplicates(parsed: ParsedImport, existing: { trades: Trade[]; cashFlows: CashFlow[] }) {
  const counts = new Map<string, number>();
  for (const t of existing.trades) counts.set(tradeKey(t), (counts.get(tradeKey(t)) ?? 0) + 1);
  for (const f of existing.cashFlows) counts.set(flowKey(f), (counts.get(flowKey(f)) ?? 0) + 1);
  const take = (key: string) => {
    const n = counts.get(key) ?? 0;
    if (n > 0) counts.set(key, n - 1);
    return n > 0;
  };
  const duplicateLines: number[] = [];
  const trades = parsed.trades.filter((t) => (!t.needsPrice && take(tradeKey(t)) ? (duplicateLines.push(t.line), false) : true));
  const cashFlows = parsed.cashFlows.filter((f) => (take(flowKey(f)) ? (duplicateLines.push(f.line), false) : true));
  return { trades, cashFlows, duplicateLines: duplicateLines.sort((a, b) => a - b) };
}
