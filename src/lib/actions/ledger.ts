"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { benchmarkSectorWeights, cashFlows, securities, teamSectors, teams, trades } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { validateLedger } from "@/lib/attribution/ledger";
import { GICS_SECTORS, YAHOO_FUND_KEY_TO_GICS, BENCHMARK_REFERENCE, type GicsSector } from "@/lib/attribution/sectors";
import { ensureSecurity, loadLedger, loadSeries } from "@/lib/attribution/store";
import type { CashFlow, Trade } from "@/lib/attribution/types";
import { runPricesJob } from "@/lib/jobs/prices";
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
