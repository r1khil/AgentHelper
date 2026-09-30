import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { flags, pitchEstimates, type KillCriterion, type PitchEstimate } from "@/db/schema";
import { resolveKeyFinancials } from "@/lib/agent/financials";
import { getCompanyFacts, tickerToCik } from "@/lib/providers/edgar";
import { getBarsRange, getQuote } from "@/lib/providers/yahoo";
import { todayNY } from "@/lib/providers/calendar";
import { checkKillCriteria, horizonEnd, isCheckable, meets, parseCondition, scoreOutcome, type MetricReadings } from "./calibration";

const num = (v: string | null) => (v === null ? null : Number(v));

/** A pitch with its numbers as numbers, for the page. */
export type PitchView = Omit<PitchEstimate, "priceAtPitch" | "intrinsicValue" | "priceTarget"> & { priceAtPitch: number | null; intrinsicValue: number; priceTarget: number };

export function pitchView(p: PitchEstimate): PitchView {
  return { ...p, priceAtPitch: num(p.priceAtPitch), intrinsicValue: Number(p.intrinsicValue), priceTarget: Number(p.priceTarget) };
}

/** Pitches, newest first: a team's, several teams', or one company's. */
export async function listPitches(opts: { teamIds?: string[]; ticker?: string; limit?: number } = {}): Promise<PitchView[]> {
  const where = [opts.teamIds ? inArray(pitchEstimates.teamId, opts.teamIds.length ? opts.teamIds : ["00000000-0000-0000-0000-000000000000"]) : undefined, opts.ticker ? eq(pitchEstimates.ticker, opts.ticker) : undefined].filter(Boolean);
  const rows = await db
    .select()
    .from(pitchEstimates)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(pitchEstimates.pitchedOn), desc(pitchEstimates.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map(pitchView);
}

/**
 * What code can read for a company's kill criteria: margins from the latest quarter (the latest year when quarters
 * aren't tagged), revenue growth against the same quarter a year earlier, and the share price.
 */
export async function metricReadings(ticker: string, cik: string | null): Promise<MetricReadings> {
  const out: MetricReadings = {};
  const quote = await getQuote(ticker).catch(() => null);
  if (quote?.price) out.price = { value: quote.price, asOf: todayNY() };
  const id = cik ?? (await tickerToCik(ticker).catch(() => null))?.cik ?? null;
  if (!id) return out;
  const facts = await getCompanyFacts(id).catch(() => null);
  if (!facts) return out;
  const q = resolveKeyFinancials(facts, "quarter", 8);
  const a = resolveKeyFinancials(facts, "annual", 2);
  const latest = q.rows[0]?.values.revenue ? q.rows[0] : a.rows[0];
  if (latest) {
    const rev = latest.values.revenue?.value;
    if (rev) {
      if (latest.values.grossProfit) out.gross_margin = { value: (latest.values.grossProfit.value / rev) * 100, asOf: latest.end };
      if (latest.values.operatingIncome) out.operating_margin = { value: (latest.values.operatingIncome.value / rev) * 100, asOf: latest.end };
      if (latest.values.netIncome) out.net_margin = { value: (latest.values.netIncome.value / rev) * 100, asOf: latest.end };
    }
  }
  // The same quarter a year earlier, by date: fiscal Q4 is rarely tagged as a quarter, so the fifth row back isn't it.
  const yearAgo = latest === q.rows[0] ? q.rows.find((r) => Math.abs(daysBetween(r.end, latest.end) - 365) <= 20) : a.rows[1];
  const now = latest?.values.revenue?.value;
  const then = yearAgo?.values.revenue?.value;
  if (now && then) out.revenue_growth = { value: (now / then - 1) * 100, asOf: latest!.end };
  return out;
}

const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/** The close on (or the last session before) the pitch date; today's quote for a pitch dated today. */
async function priceOn(ticker: string, day: string): Promise<number | null> {
  if (day >= todayNY()) return (await getQuote(ticker).catch(() => null))?.price ?? null;
  const from = new Date(Date.parse(day) - 10 * 86_400_000).toISOString().slice(0, 10);
  const bars = await getBarsRange(ticker, from, day)
    .then((r) => r.bars)
    .catch(() => []);
  return bars.at(-1)?.close ?? null;
}

export type NewPitch = {
  ticker: string;
  teamId: string;
  cohort: string;
  pitchedOn: string;
  intrinsicValue: number;
  priceTarget: number;
  horizonMonths: number;
  confidence: number;
  keyMetric: string;
  killCriteria: string[];
  createdBy: string;
};

export async function insertPitch(p: NewPitch): Promise<PitchView> {
  const price = await priceOn(p.ticker, p.pitchedOn);
  const [row] = await db
    .insert(pitchEstimates)
    .values({
      ticker: p.ticker,
      teamId: p.teamId,
      cohort: p.cohort,
      pitchedOn: p.pitchedOn,
      priceAtPitch: price ? String(price) : null,
      intrinsicValue: String(p.intrinsicValue),
      priceTarget: String(p.priceTarget),
      horizonMonths: p.horizonMonths,
      confidence: p.confidence,
      keyMetric: p.keyMetric,
      killCriteria: p.killCriteria.map(parseCondition),
      createdBy: p.createdBy,
    })
    .returning();
  return pitchView(row);
}

/**
 * Checks every live pitch's kill criteria that code can read, and raises one flag (Home's bell and the company page)
 * the first time a criterion trips. Criteria code can't read stay as the quarterly review prompt. Also scores pitches
 * whose horizon has passed. Run after filings sync (the filing-changes job) and from the company page.
 */
export async function runPitchChecks(opts: { tickers?: string[] } = {}): Promise<{ checked: number; tripped: number; scored: number }> {
  const today = todayNY();
  const rows = (await listPitches({ limit: 500 })).filter((p) => !opts.tickers || opts.tickers.includes(p.ticker));
  const byTicker = new Map<string, PitchView[]>();
  for (const p of rows) byTicker.set(p.ticker, [...(byTicker.get(p.ticker) ?? []), p]);
  let checked = 0;
  let tripped = 0;
  let scored = 0;
  for (const [ticker, pitches] of byTicker) {
    const live = pitches.filter((p) => !p.outcome);
    if (!live.length) continue;
    const readings = await metricReadings(ticker, null);
    for (const p of live) {
      const before = new Set(p.killCriteria.filter((c) => c.tripped).map((c) => c.text));
      const next = checkKillCriteria(p.killCriteria, readings, today);
      checked += next.filter(isCheckable).length;
      const newly = next.filter((c) => c.tripped && !before.has(c.text));
      const end = horizonEnd(p.pitchedOn, p.horizonMonths);
      const outcome = end <= today ? await scorePitch(p, readings, end, today) : null;
      if (outcome) scored++;
      await db
        .update(pitchEstimates)
        .set({ killCriteria: next, ...(outcome ? { outcome } : {}) })
        .where(eq(pitchEstimates.id, p.id));
      // One flag per pitch (flags are unique by source): the first criterion to trip raises it.
      for (const c of newly.slice(0, 1)) {
        tripped++;
        await db
          .insert(flags)
          .values({ ticker, kind: "kill_criterion", sourceId: p.id, title: `${ticker}: kill criterion met, ${c.text}`, href: `/screener/${encodeURIComponent(ticker)}?tab=pitch` })
          .onConflictDoNothing();
      }
    }
  }
  return { checked, tripped, scored };
}

async function scorePitch(p: PitchView, readings: MetricReadings, end: string, today: string) {
  const bars = await getBarsRange(p.ticker, p.pitchedOn, end)
    .then((r) => r.bars)
    .catch(() => []);
  const key = parseCondition(p.keyMetric);
  const reading = isCheckable(key) ? readings[key.metric] : undefined;
  const keyMet = isCheckable(key) && reading ? meets(reading.value, key.op, key.threshold) : null;
  return scoreOutcome(p, bars, keyMet, today);
}

/** Flags still open for a company's pitches (kill criteria met and not dismissed). */
export async function openPitchFlags(ticker: string) {
  return db
    .select()
    .from(flags)
    .where(and(eq(flags.ticker, ticker), eq(flags.kind, "kill_criterion"), isNull(flags.dismissedAt)));
}

export type { KillCriterion };
