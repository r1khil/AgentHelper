import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyCloses, holdings, securities, weeklyUpdates } from "@/db/schema";
import { listBellwethers, listCalendarHoldingEvents } from "@/lib/earnings";
import { getEconomicCalendar } from "@/lib/economic-calendar/service";
import { noopReporter, type JobReporter } from "@/lib/jobs/progress";
import { tickerKey } from "@/lib/pt-sheet/reconcile";
import { carryForward, withSheetFigures } from "./figures";
import { readSheetWeekly, sheetReadDetail, type SheetWeeklyRead } from "./sheet";
import { deckName } from "./format";
import { pickMarketNews } from "./market-news";
import { buildCloseLookup, chooseMovers, weeklyReturns, type PerformerHolding } from "./performers";
import { ensurePack, getPack, noteSource, normalizeAgenda, packFigures } from "./store";
import type { AgendaItem, FigureValue, WeeklyAgenda, WeeklyFigures, WeeklyPerformers, WeeklySources } from "./types";
import { agendaWeek, previousWeekEnding, priceWindow, weekdayLabel } from "./weeks";


export type BuildResult = {
  weekEnding: string;
  status: "ok" | "skipped";
  reason?: string;
  performers?: { ranked: number; missing: number; source: "sheet" | "closes" };
  earnings?: number;
  marketNews?: number;
  agendaHeld?: boolean;
  failed: string[];
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The week's top and worst performers: the sheet's "% 1 Week" when it measures the deck's window, else the app's
 * Monday-close-to-Friday-close returns. The universe is the active holdings plus anything the sheet lists, so a position the
 * ledger hasn't caught up with still counts.
 */
async function computeWeeklyPerformers(weekEnding: string, sheet: SheetWeeklyRead | null): Promise<WeeklyPerformers> {
  const window = priceWindow(weekEnding);
  const [held, named] = await Promise.all([
    db.select({ ticker: holdings.ticker, name: holdings.companyName, status: holdings.status }).from(holdings),
    db.select({ ticker: securities.ticker, name: securities.name }).from(securities),
  ]);
  // A holding's own name wins over the securities table's.
  const names = new Map<string, string>([...named, ...held].map((r) => [tickerKey(r.ticker), deckName(r.name)]));
  const active = held.filter((h) => h.status === "active");
  const tickers = new Set([...active.map((h) => h.ticker), ...(sheet?.moves.rows ?? []).map((m) => m.ticker), ...(sheet?.moves.blank ?? [])]);
  const universe: PerformerHolding[] = [...tickers].map((ticker) => ({ ticker, name: names.get(tickerKey(ticker)) ?? ticker }));
  const closeRows = universe.length
    ? await db
        .select({ ticker: dailyCloses.ticker, sessionDate: dailyCloses.sessionDate, close: dailyCloses.close })
        .from(dailyCloses)
        .where(and(inArray(dailyCloses.ticker, [...tickers]), gte(dailyCloses.sessionDate, window.start), lte(dailyCloses.sessionDate, window.end)))
    : [];
  const closes = weeklyReturns({ holdings: universe, closes: buildCloseLookup(closeRows), ...window });
  return chooseMovers({ sheet: sheet?.moves.rows ?? null, sheetBlank: sheet?.moves.blank, sheetProblem: sheet ? sheet.moves.problem : "Google Drive is not configured here", readAt: sheet?.readAt, closes, names, window });
}

/**
 * Holdings' reports plus tracked sector bellwethers in the coming week, grouped by weekday. For holdings the sheet's
 * Earnings Date wins; the app's earnings calendar fills in any holding the sheet has no date for.
 */
async function computeEarningsItems(weekEnding: string, sheet: SheetWeeklyRead["earnings"] | null): Promise<AgendaItem[]> {
  const { from, to } = agendaWeek(weekEnding);
  const [holdingEvents, bellwethers] = await Promise.all([listCalendarHoldingEvents(from, to), listBellwethers()]);
  const sheetDated = new Set(sheet?.dated ?? []);
  const byTicker = new Map<string, { date: string; ticker: string }>();
  for (const e of sheet?.rows ?? []) byTicker.set(e.ticker, { date: e.date, ticker: e.ticker });
  for (const row of holdingEvents) {
    if (!row.e.reportDate || byTicker.has(row.h.ticker) || sheetDated.has(tickerKey(row.h.ticker))) continue;
    byTicker.set(row.h.ticker, { date: row.e.reportDate, ticker: row.h.ticker });
  }
  for (const b of bellwethers) {
    if (!b.reportDate || b.reportDate < from || b.reportDate > to) continue;
    if (!byTicker.has(b.ticker)) byTicker.set(b.ticker, { date: b.reportDate, ticker: b.ticker });
  }
  return [...byTicker.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker))
    .map((e) => ({ day: weekdayLabel(e.date), text: e.ticker }));
}

/** The week's scheduled economic releases worth a line, most important first within each day. */
async function computeMarketNewsItems(weekEnding: string): Promise<AgendaItem[]> {
  const range = agendaWeek(weekEnding);
  const feed = await getEconomicCalendar(range);
  return pickMarketNews(feed.events, range).map((e) => ({ day: weekdayLabel(e.date), text: e.name }));
}

/** An exec's entry, or a figure already read from the sheet, beats last week's placeholder. */
const keepEntered = (current: FigureValue, carried: FigureValue): FigureValue =>
  current.source !== "carried" && current.value !== null ? current : carried;

/**
 * Build (or rebuild) the pack for a Friday. Every step stands on its own: a provider that is down
 * costs that one section and is recorded in `sources`, never the whole pack. A pack an exec has
 * edited keeps its agenda, and a pack marked sent is not touched at all.
 */
export async function buildWeeklyPack(weekEnding: string, opts: { reason: string; progress?: JobReporter } = { reason: "manual" }): Promise<BuildResult> {
  const progress = opts.progress ?? noopReporter;
  const row = await ensurePack(weekEnding);
  if (row.status === "sent") {
    progress.step("weekly pack already sent", { weekEnding });
    return { weekEnding, status: "skipped", reason: "the pack is marked sent", failed: [] };
  }
  const edited = Boolean(row.editedAt);
  const failed: string[] = [];
  let sources: WeeklySources = { ...(row.sources ?? {}) };
  const update: Partial<typeof weeklyUpdates.$inferInsert> = { builtAt: new Date(), updatedAt: new Date() };

  progress.step("roll last week's agenda", { weekEnding, reason: opts.reason });
  let lastWeekAgenda: WeeklyAgenda | null = null;
  try {
    const prev = await getPack(previousWeekEnding(weekEnding));
    lastWeekAgenda = prev ? normalizeAgenda(prev.agenda) : null;
    update.lastWeekAgenda = lastWeekAgenda;
    // Figures are placeholders until an exec saves them; anything already entered wins.
    const current = packFigures(row);
    const carried = carryForward(prev ? packFigures(prev) : null);
    const figures: WeeklyFigures = {
      aumK: keepEntered(current.aumK, carried.aumK),
      ytdPct: keepEntered(current.ytdPct, carried.ytdPct),
      benchmarkYtdPct: keepEntered(current.benchmarkYtdPct, carried.benchmarkYtdPct),
    };
    update.figures = figures;
    sources = noteSource(sources, "carry", { status: "ok", detail: prev ? `carried from ${prev.weekEnding}` : "no previous pack" });
  } catch (e) {
    failed.push("carry");
    sources = noteSource(sources, "carry", { status: "failed", error: message(e) });
    progress.warn("carry forward failed", { error: message(e) });
  }

  // The sheet is the execs' source for the figures, the performers and holdings' earnings; an exec's own entry still wins.
  progress.step("read the price target sheet");
  let sheet: SheetWeeklyRead | null = null;
  try {
    sheet = await readSheetWeekly(agendaWeek(weekEnding));
    if (!sheet) sources = noteSource(sources, "sheet", { status: "held", detail: "Google Drive is not configured here" });
    else {
      const read = sheet.figures;
      update.figures = withSheetFigures(update.figures ?? packFigures(row), read, read.asOf);
      sources = noteSource(sources, "sheet", { status: read.problems.length ? "failed" : "ok", detail: sheetReadDetail(read), ...(read.problems.length ? { error: read.problems.join(" ") } : {}) });
    }
  } catch (e) {
    failed.push("sheet");
    sources = noteSource(sources, "sheet", { status: "failed", error: message(e) });
    progress.warn("sheet figures failed", { error: message(e) });
  }

  progress.step("rank weekly performers");
  let performers: WeeklyPerformers | null = null;
  try {
    performers = await computeWeeklyPerformers(weekEnding, sheet);
    update.performers = performers;
    sources = noteSource(sources, "performers", {
      status: "ok",
      detail:
        performers.source === "sheet"
          ? `${performers.top.length + performers.worst.length} ranked from the PT sheet's "% 1 Week"`
          : `${performers.top.length + performers.worst.length} ranked from closes, ${performers.missing.length} without closes`,
    });
  } catch (e) {
    failed.push("performers");
    sources = noteSource(sources, "performers", { status: "failed", error: message(e) });
    progress.warn("performers failed", { error: message(e) });
  }

  const agenda = normalizeAgenda(row.agenda);
  let earningsItems: AgendaItem[] = agenda.earnings;
  let marketNewsItems: AgendaItem[] = agenda.marketNews;

  progress.step("collect earnings for the coming week");
  try {
    const items = await computeEarningsItems(weekEnding, sheet && !sheet.earnings.problem ? sheet.earnings : null);
    if (!edited) earningsItems = items;
    sources = noteSource(sources, "earnings", edited ? { status: "held", detail: `${items.length} found; the pack has exec edits` } : { status: "ok", detail: `${items.length} reports` });
  } catch (e) {
    failed.push("earnings");
    sources = noteSource(sources, "earnings", { status: "failed", error: message(e) });
    progress.warn("earnings failed", { error: message(e) });
  }

  progress.step("collect market news for the coming week");
  try {
    const items = await computeMarketNewsItems(weekEnding);
    if (!edited) marketNewsItems = items;
    sources = noteSource(sources, "marketNews", edited ? { status: "held", detail: `${items.length} found; the pack has exec edits` } : { status: "ok", detail: `${items.length} events` });
  } catch (e) {
    failed.push("marketNews");
    sources = noteSource(sources, "marketNews", { status: "failed", error: message(e) });
    progress.warn("market news failed", { error: message(e) });
  }

  // Process updates are only ever written by an exec or by a parsed reply.
  update.agenda = { earnings: earningsItems, marketNews: marketNewsItems, processUpdates: agenda.processUpdates };
  update.sources = sources;
  await db.update(weeklyUpdates).set(update).where(eq(weeklyUpdates.weekEnding, weekEnding));

  return {
    weekEnding,
    status: "ok",
    performers: performers ? { ranked: performers.top.length + performers.worst.length, missing: performers.missing.length, source: performers.source ?? "closes" } : undefined,
    earnings: earningsItems.length,
    marketNews: marketNewsItems.length,
    agendaHeld: edited,
    failed,
  };
}
