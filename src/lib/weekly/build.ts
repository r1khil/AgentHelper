import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyCloses, holdings, weeklyUpdates } from "@/db/schema";
import { listBellwethers, listCalendarHoldingEvents } from "@/lib/earnings";
import { getEconomicCalendar } from "@/lib/economic-calendar/service";
import { noopReporter, type JobReporter } from "@/lib/jobs/progress";
import { carryForward, withSheetFigures } from "./figures";
import { readSheetWeeklyFigures, sheetReadDetail } from "./sheet";
import { pickMarketNews } from "./market-news";
import { buildCloseLookup, rankWeeklyMovers, type PerformerHolding } from "./performers";
import { ensurePack, getPack, noteSource, normalizeAgenda, packFigures } from "./store";
import type { AgendaItem, FigureValue, WeeklyAgenda, WeeklyFigures, WeeklyPerformers, WeeklySources } from "./types";
import { agendaWeek, previousWeekEnding, priceWindow, weekdayLabel } from "./weeks";


export type BuildResult = {
  weekEnding: string;
  status: "ok" | "skipped";
  reason?: string;
  performers?: { ranked: number; missing: number };
  earnings?: number;
  marketNews?: number;
  agendaHeld?: boolean;
  failed: string[];
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Monday-close-to-Friday-close price returns for every active holding. */
async function computeWeeklyPerformers(weekEnding: string): Promise<WeeklyPerformers> {
  const { start, end } = priceWindow(weekEnding);
  const rows = await db
    .select({ ticker: holdings.ticker, name: holdings.companyName })
    .from(holdings)
    .where(eq(holdings.status, "active"));
  const unique = new Map<string, PerformerHolding>();
  for (const r of rows) if (!unique.has(r.ticker)) unique.set(r.ticker, r);
  const list = [...unique.values()];
  if (!list.length) return { top: [], worst: [], missing: [], window: { start, end } };
  const closeRows = await db
    .select({ ticker: dailyCloses.ticker, sessionDate: dailyCloses.sessionDate, close: dailyCloses.close })
    .from(dailyCloses)
    .where(and(inArray(dailyCloses.ticker, list.map((h) => h.ticker)), gte(dailyCloses.sessionDate, start), lte(dailyCloses.sessionDate, end)));
  return rankWeeklyMovers({ holdings: list, closes: buildCloseLookup(closeRows), start, end }, 3);
}

/** Holdings' reports plus tracked sector bellwethers in the coming week, grouped by weekday. */
async function computeEarningsItems(weekEnding: string): Promise<AgendaItem[]> {
  const { from, to } = agendaWeek(weekEnding);
  const [holdingEvents, bellwethers] = await Promise.all([listCalendarHoldingEvents(from, to), listBellwethers()]);
  const byTicker = new Map<string, { date: string; ticker: string }>();
  for (const row of holdingEvents) {
    if (!row.e.reportDate) continue;
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

  // The sheet is the execs' source for these; an exec's own entry still wins.
  progress.step("read the price target sheet's figures");
  try {
    const read = await readSheetWeeklyFigures();
    if (!read) sources = noteSource(sources, "sheet", { status: "held", detail: "Google Drive is not configured here" });
    else {
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
    performers = await computeWeeklyPerformers(weekEnding);
    update.performers = performers;
    sources = noteSource(sources, "performers", {
      status: "ok",
      detail: `${performers.top.length + performers.worst.length} ranked, ${performers.missing.length} without closes`,
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
    const items = await computeEarningsItems(weekEnding);
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
    performers: performers ? { ranked: performers.top.length + performers.worst.length, missing: performers.missing.length } : undefined,
    earnings: earningsItems.length,
    marketNews: marketNewsItems.length,
    agendaHeld: edited,
    failed,
  };
}
