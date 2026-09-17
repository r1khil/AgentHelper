"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { benchmarkSectorWeights, cashFlows, dailyCloses, securities, teamSectors, teams, trades } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { parseLedgerCsv, splitDuplicates, type ImportIssue } from "@/lib/attribution/csv";
import { validateLedger } from "@/lib/attribution/ledger";
import { GICS_SECTORS, YAHOO_FUND_KEY_TO_GICS, BENCHMARK_REFERENCE, benchmarkSymbols, type GicsSector } from "@/lib/attribution/sectors";
import { ensureSecurity, historyFrom, loadLedger, loadSeries } from "@/lib/attribution/store";
import type { CashFlow, Trade } from "@/lib/attribution/types";
import { runPricesJob } from "@/lib/jobs/prices";
import { syncPrices } from "@/lib/prices";
import { isTradingDay, todayNY } from "@/lib/providers/calendar";
import { getFundSectorWeights } from "@/lib/providers/yahoo";
import type { ActionResult } from "./holdings";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const sectorEnum = z.enum(GICS_SECTORS);

function refresh() {
  revalidatePath("/attribution", "layout");
  revalidatePath("/t/[team]/attribution", "page");
  revalidatePath("/t/[team]", "page");
}

/** Replay the ledger as it would be after an edit; returns the first problem, or a cash warning. */
async function check(next: { trades: Trade[]; cashFlows: CashFlow[] }): Promise<{ error?: string; warning?: string }> {
  const issue = validateLedger(next.trades, next.cashFlows, { today: todayNY(), isTradingDay }).find((i) => i.level === "error");
  if (issue) return { error: issue.message };
  const replay = await loadSeries(db, next);
  const over = replay.quality.ledger.oversold[0];
  if (over) return { error: `That would sell ${over.shares.toFixed(4)} more ${over.ticker} shares than the Fund held on ${over.date}.` };
  const cash = replay.series.portfolio.at(-1)?.cashEnd ?? 0;
  return cash < -0.005 ? { warning: `Cash is ${cash.toLocaleString("en-US", { style: "currency", currency: "USD" })} after this. Record the deposit or sale that funded it.` } : {};
}

export async function recordTrade(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  const parsed = z
    .object({
      tradeDate: isoDate,
      ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,10}$/, "Enter a ticker like NVDA"),
      side: z.enum(["buy", "sell"]),
      shares: z.coerce.number().positive("Shares must be more than zero").max(1e9),
      price: z.coerce.number().positive("Price must be more than zero").max(1e7),
      fees: z.coerce.number().min(0).max(1e6).default(0),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({
      tradeDate: fd.get("tradeDate"), ticker: fd.get("ticker"), side: fd.get("side"), shares: fd.get("shares"),
      price: fd.get("price"), fees: fd.get("fees") || 0, note: fd.get("note") ?? "",
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  const t = parsed.data;

  const security = await ensureSecurity(db, t.ticker);
  if (!security) return { ok: false, error: `Could not find ${t.ticker} on the market data provider` };

  const ledger = await loadLedger(db);
  const verdict = await check({
    trades: [...ledger.trades, { date: t.tradeDate, ticker: t.ticker, side: t.side, shares: t.shares, price: t.price, fees: t.fees }],
    cashFlows: ledger.cashFlows,
  });
  if (verdict.error) return { ok: false, error: verdict.error };

  await db.insert(trades).values({
    tradeDate: t.tradeDate, ticker: t.ticker, side: t.side, shares: t.shares.toString(), price: t.price.toString(),
    fees: t.fees.toFixed(2), note: t.note || null, createdBy: user.id,
  });
  // Backfills a new ticker's history and refreshes share counts on holdings.
  after(() => runPricesJob());
  refresh();
  const verb = t.side === "buy" ? "Bought" : "Sold";
  return { ok: true, message: `${verb} ${t.shares} ${t.ticker}.${verdict.warning ? ` ${verdict.warning}` : ""}` };
}

export async function voidTrade(fd: FormData): Promise<void> {
  const user = await requireRole("exec", "admin");
  const id = z.string().uuid().parse(fd.get("id"));
  const [row] = await db.select().from(trades).where(and(eq(trades.id, id), isNull(trades.voidedAt))).limit(1);
  if (!row) return;
  const ledger = await loadLedger(db);
  const remaining = await db.select().from(trades).where(isNull(trades.voidedAt));
  const next = remaining
    .filter((r) => r.id !== id)
    .map((r) => ({ date: r.tradeDate, ticker: r.ticker, side: r.side, shares: Number(r.shares), price: Number(r.price), fees: Number(r.fees) }));
  const verdict = await check({ trades: next, cashFlows: ledger.cashFlows });
  if (verdict.error) throw new Error(`Cannot void this trade. ${verdict.error}`);
  await db.update(trades).set({ voidedAt: new Date(), voidedBy: user.id }).where(eq(trades.id, id));
  after(() => runPricesJob());
  refresh();
}

export async function recordCashFlow(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  const parsed = z
    .object({
      flowDate: isoDate,
      kind: z.enum(["deposit", "withdrawal", "fee", "interest"]),
      amount: z.coerce.number().positive("Amount must be more than zero").max(1e12),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({ flowDate: fd.get("flowDate"), kind: fd.get("kind"), amount: fd.get("amount"), note: fd.get("note") ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  const f = parsed.data;
  if (f.flowDate > todayNY()) return { ok: false, error: "That date is in the future." };
  await db.insert(cashFlows).values({ flowDate: f.flowDate, kind: f.kind, amount: f.amount.toFixed(2), note: f.note || null, createdBy: user.id });
  refresh();
  return { ok: true, message: "Recorded" };
}

export async function voidCashFlow(fd: FormData): Promise<void> {
  const user = await requireRole("exec", "admin");
  const id = z.string().uuid().parse(fd.get("id"));
  await db.update(cashFlows).set({ voidedAt: new Date(), voidedBy: user.id }).where(and(eq(cashFlows.id, id), isNull(cashFlows.voidedAt)));
  refresh();
}

export async function saveBenchmarkWeights(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  const asOf = isoDate.safeParse(fd.get("asOf"));
  if (!asOf.success) return { ok: false, error: "Enter the as-of date" };
  if (asOf.data > todayNY()) return { ok: false, error: "The as-of date is in the future." };
  const rows: { sector: GicsSector; weight: number }[] = [];
  for (const sector of GICS_SECTORS) {
    const w = Number(fd.get(`w_${sector}`) ?? 0);
    if (!Number.isFinite(w) || w < 0 || w > 100) return { ok: false, error: "Each weight must be between 0 and 100." };
    rows.push({ sector, weight: w });
  }
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (Math.abs(total - 100) > 0.1) return { ok: false, error: `Weights add up to ${total.toFixed(2)}%. They need to total 100%.` };
  const source = String(fd.get("source") ?? "").trim().slice(0, 200) || null;
  await db.transaction(async (tx) => {
    await tx.delete(benchmarkSectorWeights).where(eq(benchmarkSectorWeights.asOf, asOf.data));
    await tx.insert(benchmarkSectorWeights).values(rows.map((r) => ({ asOf: asOf.data, sector: r.sector, weightPct: r.weight.toFixed(4), source, updatedBy: user.id })));
  });
  refresh();
  return { ok: true, message: `Saved weights as of ${asOf.data}` };
}

export async function deleteBenchmarkWeights(fd: FormData): Promise<void> {
  await requireRole("exec", "admin");
  const asOf = isoDate.parse(fd.get("asOf"));
  await db.delete(benchmarkSectorWeights).where(eq(benchmarkSectorWeights.asOf, asOf));
  refresh();
}

/** SPY's sector mix from Yahoo as a starting point. Morningstar sectors, so review before saving. */
export async function prefillBenchmarkWeights(): Promise<{ ok: true; weights: Record<GicsSector, number> } | { ok: false; error: string }> {
  await requireRole("exec", "admin");
  try {
    const raw = await getFundSectorWeights(BENCHMARK_REFERENCE);
    const weights = Object.fromEntries(GICS_SECTORS.map((s) => [s, 0])) as Record<GicsSector, number>;
    for (const [k, v] of Object.entries(raw)) {
      const sector = YAHOO_FUND_KEY_TO_GICS[k];
      if (sector) weights[sector] = Math.round(v * 100) / 100;
    }
    if (Object.values(weights).every((w) => w === 0)) return { ok: false, error: "The data provider returned no sector weights." };
    return { ok: true, weights };
  } catch {
    return { ok: false, error: "Could not reach the data provider." };
  }
}

export async function setSecurityClassification(fd: FormData): Promise<void> {
  await requireRole("exec", "admin");
  const ticker = z.string().min(1).max(10).parse(fd.get("ticker"));
  const sector = sectorEnum.nullable().parse(String(fd.get("sector") ?? "") || null);
  const teamId = z.string().uuid().nullable().parse(String(fd.get("teamId") ?? "") || null);
  const [current] = await db.select().from(securities).where(eq(securities.ticker, ticker)).limit(1);
  if (!current) return;
  await db
    .update(securities)
    .set({ sector, teamId, sectorSource: sector === current.sector ? current.sectorSource : "manual" })
    .where(eq(securities.ticker, ticker));
  refresh();
}

export async function setTeamSectors(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireRole("exec", "admin");
  const teamIds = new Set((await db.select({ id: teams.id }).from(teams)).map((t) => t.id));
  const rows: { sector: GicsSector; teamId: string }[] = [];
  for (const sector of GICS_SECTORS) {
    const teamId = String(fd.get(`team_${sector}`) ?? "");
    if (!teamId) continue;
    if (!teamIds.has(teamId)) return { ok: false, error: "Unknown team" };
    rows.push({ sector, teamId });
  }
  await db.transaction(async (tx) => {
    await tx.delete(teamSectors);
    if (rows.length) await tx.insert(teamSectors).values(rows);
  });
  refresh();
  return { ok: true, message: "Saved team sectors" };
}

// ---- CSV import ----

export type ImportPreview =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: number;
      trades: number;
      cashFlows: number;
      duplicates: number;
      from: string | null;
      to: string | null;
      errors: ImportIssue[];
      moreErrors: number;
      /** The file starts before the ledger does, so the current opening snapshot would double count. */
      predatesInception: boolean;
      openingEntries: number;
      newTickers: string[];
      /** Share counts after the import where they differ from today's ledger. */
      positionChanges: { ticker: string; now: number; after: number }[];
      positionsAfter: number;
      cashAfter: number | null;
    };

const MAX_IMPORT_BYTES = 900_000;

async function currentOpening() {
  const openingTrades = await db.select().from(trades).where(and(eq(trades.kind, "opening"), isNull(trades.voidedAt)));
  const dates = new Set(openingTrades.map((t) => t.tradeDate));
  const flows = (await db.select().from(cashFlows).where(and(eq(cashFlows.kind, "deposit"), isNull(cashFlows.voidedAt)))).filter(
    (f) => f.note === "Opening balance" && dates.has(f.flowDate),
  );
  return { openingTrades, openingFlows: flows };
}

function shareCounts(days: { positions: { ticker: string; sharesEnd: number }[] }[]): Map<string, number> {
  return new Map((days.at(-1)?.positions ?? []).filter((p) => p.sharesEnd > 0).map((p) => [p.ticker, p.sharesEnd]));
}

async function planImport(text: string, replaceOpening: boolean) {
  const parsed = parseLedgerCsv(text, { today: todayNY(), isTradingDay });
  const [all, opening] = await Promise.all([db.select().from(trades).where(isNull(trades.voidedAt)), currentOpening()]);
  const allFlows = await db.select().from(cashFlows).where(isNull(cashFlows.voidedAt));
  const dropTrades = new Set(replaceOpening ? opening.openingTrades.map((t) => t.id) : []);
  const dropFlows = new Set(replaceOpening ? opening.openingFlows.map((f) => f.id) : []);
  const keptTrades: Trade[] = all
    .filter((t) => !dropTrades.has(t.id))
    .map((t) => ({ date: t.tradeDate, ticker: t.ticker, side: t.side, shares: Number(t.shares), price: Number(t.price), fees: Number(t.fees) }));
  const keptFlows: CashFlow[] = allFlows.filter((f) => !dropFlows.has(f.id)).map((f) => ({ date: f.flowDate, kind: f.kind, amount: Number(f.amount) }));
  const fresh = splitDuplicates(parsed, { trades: keptTrades, cashFlows: keptFlows });
  return { parsed, fresh, keptTrades, keptFlows, opening };
}

export async function previewLedgerImport(text: string, replaceOpening: boolean): Promise<ImportPreview> {
  await requireRole("exec", "admin");
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "That file is too large. Split it into files under 900 KB." };
  const { parsed, fresh, keptTrades, keptFlows, opening } = await planImport(text, replaceOpening);
  const ledger = await loadLedger(db);
  const dates = [...fresh.trades.map((t) => t.date), ...fresh.cashFlows.map((f) => f.date)].sort();
  const errors = [...parsed.errors];

  let positionChanges: { ticker: string; now: number; after: number }[] = [];
  let positionsAfter = 0;
  let cashAfter: number | null = null;
  if (!errors.length && dates.length) {
    const [now, after] = await Promise.all([
      loadSeries(db),
      loadSeries(db, { trades: [...keptTrades, ...fresh.trades], cashFlows: [...keptFlows, ...fresh.cashFlows] }),
    ]);
    for (const o of after.quality.ledger.oversold) errors.push({ line: 0, message: `Sells ${o.shares.toFixed(4)} more ${o.ticker} than held on ${o.date}. A buy or opening row is probably missing.` });
    const a = shareCounts(now.series.portfolio);
    const b = shareCounts(after.series.portfolio);
    positionsAfter = b.size;
    positionChanges = [...new Set([...a.keys(), ...b.keys()])]
      .map((ticker) => ({ ticker, now: a.get(ticker) ?? 0, after: b.get(ticker) ?? 0 }))
      .filter((r) => Math.abs(r.now - r.after) > 1e-4)
      .sort((x, y) => x.ticker.localeCompare(y.ticker));
    // Cash is only meaningful when every opening row has a price.
    if (!fresh.trades.some((t) => t.needsPrice)) cashAfter = after.series.portfolio.at(-1)?.cashEnd ?? null;
  }

  const known = new Set((await db.select({ ticker: securities.ticker }).from(securities)).map((s) => s.ticker));
  return {
    ok: true,
    rows: parsed.rows,
    trades: fresh.trades.length,
    cashFlows: fresh.cashFlows.length,
    duplicates: fresh.duplicateLines.length,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    errors: errors.slice(0, 50),
    moreErrors: Math.max(0, errors.length - 50),
    predatesInception: !!dates[0] && !!ledger.inception && dates[0] < ledger.inception,
    openingEntries: opening.openingTrades.length + opening.openingFlows.length,
    newTickers: [...new Set(fresh.trades.map((t) => t.ticker))].filter((t) => !known.has(t)).sort(),
    positionChanges,
    positionsAfter,
    cashAfter,
  };
}

export async function applyLedgerImport(text: string, replaceOpening: boolean): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "That file is too large." };
  const { parsed, fresh, keptTrades, keptFlows, opening } = await planImport(text, replaceOpening);
  if (parsed.errors.length) return { ok: false, error: `Fix ${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} first. Line ${parsed.errors[0].line}: ${parsed.errors[0].message}` };
  if (!fresh.trades.length && !fresh.cashFlows.length) return { ok: false, error: "Nothing new to import. Every row is already in the ledger." };

  const tickers = [...new Set(fresh.trades.map((t) => t.ticker))];
  const unknown: string[] = [];
  for (const t of tickers) if (!(await ensureSecurity(db, t))) unknown.push(t);
  if (unknown.length) return { ok: false, error: `Could not find ${unknown.join(", ")} on the market data provider.` };

  // Prices first: opening rows without a price use that day's close, and the oversell check needs reinvested dividends.
  const ledger = await loadLedger(db);
  const earliest = [...fresh.trades.map((t) => t.date), ...fresh.cashFlows.map((f) => f.date), ...(ledger.inception ? [ledger.inception] : [])].sort()[0];
  const synced = await syncPrices(db, { symbols: [...new Set([...tickers, ...benchmarkSymbols()])], from: historyFrom(earliest), budgetMs: 200_000 });
  if (synced.remaining.length) return { ok: false, error: "Loading price history took too long. Nothing was imported; try again to continue where it stopped." };

  const needing = fresh.trades.filter((t) => t.needsPrice);
  if (needing.length) {
    const closes = await db
      .select({ ticker: dailyCloses.ticker, date: dailyCloses.sessionDate, close: dailyCloses.close })
      .from(dailyCloses)
      .where(inArray(dailyCloses.ticker, [...new Set(needing.map((t) => t.ticker))]));
    const byKey = new Map(closes.map((c) => [`${c.ticker}|${c.date}`, Number(c.close)]));
    const missing: string[] = [];
    for (const t of needing) {
      const close = byKey.get(`${t.ticker}|${t.date}`);
      if (close) t.price = close;
      else missing.push(`${t.ticker} on ${t.date} (line ${t.line})`);
    }
    if (missing.length) return { ok: false, error: `No closing price for ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}. Add a price to those rows.` };
  }

  const verdict = await check({ trades: [...keptTrades, ...fresh.trades], cashFlows: [...keptFlows, ...fresh.cashFlows] });
  if (verdict.error) return { ok: false, error: verdict.error };

  await db.transaction(async (tx) => {
    if (replaceOpening) {
      const now = new Date();
      if (opening.openingTrades.length) await tx.update(trades).set({ voidedAt: now, voidedBy: user.id }).where(inArray(trades.id, opening.openingTrades.map((t) => t.id)));
      if (opening.openingFlows.length) await tx.update(cashFlows).set({ voidedAt: now, voidedBy: user.id }).where(inArray(cashFlows.id, opening.openingFlows.map((f) => f.id)));
    }
    for (let i = 0; i < fresh.trades.length; i += 500) {
      await tx.insert(trades).values(
        fresh.trades.slice(i, i + 500).map((t) => ({
          tradeDate: t.date, ticker: t.ticker, side: t.side, kind: t.kind, shares: t.shares.toString(), price: t.price.toString(),
          fees: t.fees.toFixed(2), note: t.note, createdBy: user.id,
        })),
      );
    }
    for (let i = 0; i < fresh.cashFlows.length; i += 500) {
      await tx.insert(cashFlows).values(fresh.cashFlows.slice(i, i + 500).map((f) => ({ flowDate: f.date, kind: f.kind, amount: f.amount.toFixed(2), note: f.note, createdBy: user.id })));
    }
  });
  after(() => runPricesJob());
  refresh();
  const skipped = fresh.duplicateLines.length ? ` Skipped ${fresh.duplicateLines.length} already in the ledger.` : "";
  return { ok: true, message: `Imported ${fresh.trades.length} trades and ${fresh.cashFlows.length} cash entries.${skipped}${verdict.warning ? ` ${verdict.warning}` : ""}` };
}
