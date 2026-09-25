import { splitCsv } from "@/lib/attribution/csv";
import { SECTOR_LABELS, type GicsSector } from "@/lib/attribution/sectors";
import { bloombergSymbol, listedSymbol, usSymbol } from "./symbols";

/**
 * Parsers for each issuer's daily holdings file. Pure: bytes in, cleaned constituents out. Every
 * line that isn't a stock (cash, money-market funds, T-bills held as collateral, futures, swaps that
 * can't be tied to a stock, CVRs) is dropped and listed in `dropped`, so the weight that wasn't looked
 * through is always visible rather than silently lost. Weights stay in percent of the ETF's net
 * assets as the issuer reports them; they are not rescaled to 100.
 */

export const CONSTITUENT_SOURCES = ["ssga", "ishares", "first-trust", "roundhill", "yahoo-top10"] as const;
export type ConstituentSource = (typeof CONSTITUENT_SOURCES)[number];

export const SOURCE_LABELS: Record<ConstituentSource, string> = {
  ssga: "State Street",
  ishares: "iShares",
  "first-trust": "First Trust",
  roundhill: "Roundhill",
  "yahoo-top10": "Yahoo top 10",
};

export type Constituent = {
  symbol: string;
  name: string;
  /** Percent of the ETF's net assets. */
  weight: number;
  /** GICS sector when the issuer states it (iShares, the sector SPDRs); otherwise null. */
  sector: GicsSector | null;
};

export type DropReason = "cash" | "derivative" | "other";
export type DroppedLine = { label: string; weight: number; reason: DropReason };

export type ParsedHoldings = {
  etf: string;
  /** Date the issuer says the holdings are as of (ISO). */
  asOf: string;
  source: ConstituentSource;
  /** Heaviest first; one row per symbol. */
  constituents: Constituent[];
  dropped: DroppedLine[];
};

/** Percent of the ETF's net assets the constituents account for, at most 100. */
export function coveragePct(list: { constituents: { weight: number }[] }): number {
  const total = list.constituents.reduce((s, c) => s + c.weight, 0);
  return Math.min(100, Math.max(0, total));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** "23-Sep-2026", "Sep 23, 2026", "9/23/2026" or "2026-09-23" → "2026-09-23". */
export function parseIssuerDate(raw: string): string | null {
  const v = raw.replace(/^as of\s*/i, "").trim();
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(Number(m[1]))}`;
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(v);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(Number(m[2]))}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return v;
  return null;
}

/** "1,234.5", "4.34%", "-0.01" → number; null when it isn't one. */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const v = raw.replace(/[,%$\s]/g, "");
  if (!v || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const SECTOR_BY_LABEL: Record<string, GicsSector> = {
  ...Object.fromEntries(Object.entries(SECTOR_LABELS).map(([k, label]) => [label.toLowerCase(), k as GicsSector])),
  communication: "communication_services",
  "information tech": "information_technology",
  "consumer discret": "consumer_discretionary",
};

export function sectorFromLabel(raw: string): GicsSector | null {
  return SECTOR_BY_LABEL[raw.trim().toLowerCase()] ?? null;
}

const FUTURE_NAME = /\b(FUTURE|FUT|EMINI|E-MINI)\b|\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s?\d{2}\b/i;
const CASH_NAME = /\b(CASH|DOLLAR|CURRENCY|MONEY MARKET|MMF|TREASURY BILL|T-BILL|GOVT? (?:MONEY|OBLIG)|GOVERNMENT OBLIGATIONS|REPO)\b/i;
const OTHER_NAME = /\b(CVR|RIGHTS?|WARRANTS?|ESCROW|CONTINGENT)\b/i;
const SWAP_NAME = /\b(SWAP|TRS|TOTAL RETURN)\b/i;

function classifyNonEquity(name: string): DropReason {
  if (SWAP_NAME.test(name) || FUTURE_NAME.test(name)) return "derivative";
  if (CASH_NAME.test(name)) return "cash";
  return "other";
}

/** Merge repeated symbols, drop zero and negative lines, sort heaviest first. */
function finish(p: Omit<ParsedHoldings, "constituents"> & { constituents: Constituent[] }): ParsedHoldings {
  const bySymbol = new Map<string, Constituent>();
  const dropped = [...p.dropped];
  for (const c of p.constituents) {
    if (!(c.weight > 0)) {
      if (c.weight < 0) dropped.push({ label: `${c.name} (${c.symbol})`, weight: c.weight, reason: "other" });
      continue;
    }
    const prev = bySymbol.get(c.symbol);
    if (prev) prev.weight += c.weight;
    else bySymbol.set(c.symbol, { ...c });
  }
  const constituents = [...bySymbol.values()]
    .map((c) => ({ ...c, weight: Math.round(c.weight * 1e6) / 1e6 }))
    .sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol));
  return { etf: p.etf, asOf: p.asOf, source: p.source, constituents, dropped: dropped.filter((d) => d.weight !== 0) };
}

// --- State Street (SSGA): KRE, SPY, the Select Sector SPDRs. An .xlsx with a few header lines. ---

type Cell = string | number | null;

/** Rows of the first worksheet as plain strings and numbers. Kept separate so tests can feed rows directly. */
export async function xlsxRows(bytes: ArrayBuffer | Uint8Array): Promise<Cell[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map(cellValue));
  });
  return rows;
}

function cellValue(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return cellValue(o.text);
    if (o.result !== undefined) return cellValue(o.result);
  }
  return String(v);
}

const str = (v: Cell | undefined) => (v == null ? "" : String(v).trim());

export function parseSsgaRows(etf: string, rows: Cell[][], opts: { sector?: GicsSector | null } = {}): ParsedHoldings {
  let asOf: string | null = null;
  let header = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map(str);
    if (/^holdings:?$/i.test(cells[0] ?? "")) asOf = parseIssuerDate(cells[1] ?? "");
    if (cells.includes("Ticker") && cells.some((c) => /^weight/i.test(c))) {
      header = i;
      break;
    }
  }
  if (header < 0) throw new Error(`${etf}: no holdings header in the State Street file`);
  if (!asOf) throw new Error(`${etf}: no as-of date in the State Street file`);
  const head = rows[header].map(str);
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iName = col(/^name$/i), iTicker = col(/^ticker$/i), iWeight = col(/^weight/i);

  const constituents: Constituent[] = [];
  const dropped: DroppedLine[] = [];
  for (let i = header + 1; i < rows.length; i++) {
    const r = rows[i];
    const weight = parseNumber(r[iWeight] ?? null);
    if (weight === null) {
      if (constituents.length || dropped.length) break; // End of the table; disclaimers follow.
      continue;
    }
    const name = str(r[iName]);
    const ticker = str(r[iTicker]);
    const symbol = ticker && ticker !== "-" ? usSymbol(ticker) : null;
    if (!symbol || OTHER_NAME.test(name) || FUTURE_NAME.test(name)) {
      dropped.push({ label: ticker && ticker !== "-" ? `${name} (${ticker})` : name, weight, reason: classifyNonEquity(name) });
      continue;
    }
    constituents.push({ symbol, name, weight, sector: opts.sector ?? null });
  }
  return finish({ etf, asOf, source: "ssga", constituents, dropped });
}

export async function parseSsgaXlsx(etf: string, bytes: ArrayBuffer | Uint8Array, opts: { sector?: GicsSector | null } = {}) {
  return parseSsgaRows(etf, await xlsxRows(bytes), opts);
}

// --- iShares: SOXX, RING. A CSV with fund facts above the table; foreign listings name their exchange. ---

const ISHARES_CASH_CLASSES = /^(cash|money market|cash collateral|cash and\/or derivatives)/i;

export function parseIsharesCsv(etf: string, text: string): ParsedHoldings {
  const rows = splitCsv(text);
  let asOf: string | null = null;
  let header = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const first = rows[i][0]?.trim() ?? "";
    if (/^fund holdings as of$/i.test(first)) asOf = parseIssuerDate(rows[i][1] ?? "");
    if (first === "Ticker" && rows[i].some((c) => /^weight/i.test(c.trim()))) {
      header = i;
      break;
    }
  }
  if (header < 0) throw new Error(`${etf}: no holdings header in the iShares file`);
  if (!asOf) throw new Error(`${etf}: no as-of date in the iShares file`);
  const head = rows[header].map((h) => h.trim());
  const col = (name: RegExp) => head.findIndex((h) => name.test(h));
  const iTicker = col(/^ticker$/i), iName = col(/^name$/i), iSector = col(/^sector$/i), iClass = col(/^asset class$/i);
  const iWeight = col(/^weight/i), iLocation = col(/^location$/i), iExchange = col(/^exchange$/i);

  const constituents: Constituent[] = [];
  const dropped: DroppedLine[] = [];
  for (let i = header + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < head.length - 2) break; // Footer text.
    const weight = parseNumber(r[iWeight]);
    if (weight === null) continue;
    const ticker = r[iTicker]?.trim() ?? "";
    const name = r[iName]?.trim() ?? ticker;
    const assetClass = r[iClass]?.trim() ?? "";
    if (assetClass.toLowerCase() !== "equity") {
      const reason: DropReason = /futures|swap|forward|option|fx/i.test(assetClass) ? "derivative" : ISHARES_CASH_CLASSES.test(assetClass) ? "cash" : classifyNonEquity(name);
      dropped.push({ label: `${name} (${ticker})`, weight, reason });
      continue;
    }
    const symbol = listedSymbol(ticker, r[iExchange] ?? "", r[iLocation] ?? "");
    if (!symbol) {
      dropped.push({ label: `${name} (${ticker})`, weight, reason: "other" });
      continue;
    }
    constituents.push({ symbol, name, weight, sector: sectorFromLabel(r[iSector] ?? "") });
  }
  return finish({ etf, asOf, source: "ishares", constituents, dropped });
}

// --- First Trust: SKYY, CIBR, TDIV. An HTML page with the full table; foreign lines use Bloomberg codes. ---

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

const cellText = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

export function parseFirstTrustHtml(etf: string, html: string): ParsedHoldings {
  const asOfMatch = /Holdings of the Fund as of\s*([0-9/]+)/i.exec(html);
  const asOf = asOfMatch ? parseIssuerDate(asOfMatch[1]) : null;
  if (!asOf) throw new Error(`${etf}: no as-of date on the First Trust page`);
  const start = html.search(/>\s*Security Name\s*</i);
  if (start < 0) throw new Error(`${etf}: no holdings table on the First Trust page`);
  const tableEnd = html.indexOf("</table>", start);
  const table = html.slice(html.lastIndexOf("<tr", start), tableEnd < 0 ? undefined : tableEnd);
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cellText(c[1])));
  const head = rows[0] ?? [];
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iName = col(/security name/i), iId = col(/identifier/i), iWeight = col(/weight/i);
  if (iName < 0 || iId < 0 || iWeight < 0) throw new Error(`${etf}: unexpected First Trust columns: ${head.join(" | ")}`);

  const constituents: Constituent[] = [];
  const dropped: DroppedLine[] = [];
  for (const r of rows.slice(1)) {
    const weight = parseNumber(r[iWeight]);
    if (weight === null) continue;
    const name = r[iName] ?? "";
    const id = r[iId] ?? "";
    if (id.startsWith("$") || !id) {
      dropped.push({ label: name || id, weight, reason: id.startsWith("$") ? "cash" : classifyNonEquity(name) });
      continue;
    }
    const symbol = bloombergSymbol(id);
    if (!symbol || OTHER_NAME.test(name) || FUTURE_NAME.test(name)) {
      dropped.push({ label: `${name} (${id})`, weight, reason: classifyNonEquity(name) });
      continue;
    }
    constituents.push({ symbol, name, weight, sector: null });
  }
  return finish({ etf, asOf, source: "first-trust", constituents, dropped });
}

// --- Roundhill: DRAM. One CSV for every Roundhill fund; much of DRAM's exposure is total-return swaps. ---

/**
 * A total-return swap line names its reference security by CUSIP or SEDOL ("595112103 TRS 050427 NM").
 * When a stock line in the same fund carries that identifier, the swap is exposure to that stock and is
 * folded into it. Swaps on stocks the fund doesn't also hold outright can't be named reliably and are
 * left in the unlooked-through remainder. T-bills and money-market funds back the swaps and are cash.
 */
export function parseRoundhillCsv(etf: string, text: string): ParsedHoldings {
  const rows = splitCsv(text);
  const head = (rows[0] ?? []).map((h) => h.trim());
  const col = (name: string) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iDate = col("Date"), iAccount = col("Account"), iTicker = col("StockTicker"), iCusip = col("CUSIP");
  const iName = col("SecurityName"), iWeight = col("Weightings"), iMoney = col("MoneyMarketFlag");
  if ([iDate, iAccount, iTicker, iCusip, iName, iWeight].some((i) => i < 0)) throw new Error(`${etf}: unexpected Roundhill columns: ${head.join(",")}`);
  const mine = rows.slice(1).filter((r) => r[iAccount]?.trim().toUpperCase() === etf.toUpperCase());
  if (!mine.length) throw new Error(`${etf}: not in the Roundhill holdings file`);
  const asOf = parseIssuerDate(mine[0][iDate] ?? "");
  if (!asOf) throw new Error(`${etf}: no as-of date in the Roundhill file`);

  type Line = { ticker: string; cusip: string; name: string; weight: number; money: boolean };
  const lines: Line[] = mine
    .map((r) => ({ ticker: r[iTicker]?.trim() ?? "", cusip: r[iCusip]?.trim() ?? "", name: r[iName]?.trim() ?? "", weight: parseNumber(r[iWeight]) ?? NaN, money: (r[iMoney] ?? "").trim().toUpperCase() === "Y" }))
    .filter((l) => Number.isFinite(l.weight));

  const isSwap = (l: Line) => /\bTRS\b/i.test(l.ticker) || SWAP_NAME.test(l.name);
  const isCash = (l: Line) => l.money || /^CASH/i.test(l.cusip) || /^cash&other$/i.test(l.ticker) || /^912797|^91282/.test(l.cusip) || /treasury (bill|note)/i.test(l.name);

  const constituents: Constituent[] = [];
  const dropped: DroppedLine[] = [];
  const byId = new Map<string, Constituent>();
  for (const l of lines) {
    if (isSwap(l) || isCash(l)) continue;
    const symbol = bloombergSymbol(l.ticker);
    if (!symbol) {
      dropped.push({ label: `${l.name} (${l.ticker})`, weight: l.weight, reason: classifyNonEquity(l.name) });
      continue;
    }
    const c: Constituent = { symbol, name: l.name, weight: l.weight, sector: null };
    constituents.push(c);
    if (l.cusip) byId.set(l.cusip.toUpperCase(), c);
  }
  for (const l of lines) {
    if (isSwap(l)) {
      const ref = l.ticker.split(/\s+/)[0]?.toUpperCase() ?? "";
      const target = byId.get(ref);
      if (target) constituents.push({ ...target, weight: l.weight });
      else dropped.push({ label: l.name, weight: l.weight, reason: "derivative" });
    } else if (isCash(l)) {
      dropped.push({ label: l.name, weight: l.weight, reason: "cash" });
    }
  }
  return finish({ etf, asOf, source: "roundhill", constituents, dropped });
}

// --- Yahoo fallback: the top holdings only, labelled by how much of the fund they cover. ---

export function fromYahooTop(etf: string, asOf: string, top: { symbol: string; name: string; weightPct: number }[]): ParsedHoldings {
  const constituents: Constituent[] = top.map((h) => ({
    symbol: h.symbol.includes(".") && !/^[A-Z]{1,5}\.[A-Z]$/.test(h.symbol) ? h.symbol.toUpperCase() : (usSymbol(h.symbol) ?? h.symbol.toUpperCase()),
    name: h.name,
    weight: h.weightPct,
    sector: null,
  }));
  return finish({ etf, asOf, source: "yahoo-top10", constituents, dropped: [] });
}
