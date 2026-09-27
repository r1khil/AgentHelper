import "server-only";
import { DateTime } from "luxon";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyCloses, holdings, securities, weeklyUpdates } from "@/db/schema";
import { listBellwethers, listCalendarHoldingEvents } from "@/lib/earnings";
import { getEconomicCalendar } from "@/lib/economic-calendar/service";
import { noopReporter, type JobReporter } from "@/lib/jobs/progress";
import { generateText } from "ai";
import { agentConfigured, chatModel } from "@/lib/agent/model";
import { PT_SHEET_MODEL_ID } from "@/lib/agent/pt-sheet-guard";
import { getCompanyNews, getEarningsCalendarRange } from "@/lib/providers/finnhub";
import type { NewsItem } from "@/lib/providers/types";
import { NY } from "@/lib/providers/calendar";
import { getQuotes } from "@/lib/providers/yahoo";
import { tickerKey } from "@/lib/pt-sheet/reconcile";
import { carryForward, withSheetFigures } from "./figures";
import { readSheetWeekly, sheetReadDetail, type SheetWeeklyRead } from "./sheet";
import { readFundCalendar } from "./calendar-read";
import { US_TICKER, pickEarnings, type Reporter } from "./earnings";
import { calendarProcessUpdates } from "./fund-calendar";
import { parseWhy, whyInstructions, whyPrompt } from "./why";
import { deckName } from "./format";
import { deckMarketNews } from "./market-news";
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
  const movers = chooseMovers({ sheet: sheet?.moves.rows ?? null, sheetBlank: sheet?.moves.blank, sheetProblem: sheet ? sheet.moves.problem : "Google Drive is not configured here", readAt: sheet?.readAt, closes, names, window });
  // The app stores most names as SEC filed them ("AMAZON COM INC"); Yahoo has the company's own ("Amazon.com, Inc.").
  const quotes = await quotesFor([...movers.top, ...movers.worst].map((p) => p.ticker));
  const withName = (list: WeeklyPerformers["top"]) => list.map((p) => ({ ...p, name: deckName(quotes[p.ticker]?.name ?? p.name) }));
  return { ...movers, top: withName(movers.top), worst: withName(movers.worst) };
}

/**
 * Hoot's one-line read of why each top and worst performer moved, from Finnhub headlines for the week. The prompt carries
 * the week's returns, which come from the PT sheet, so it runs on the sheet-safe model only, with no fallback.
 */
async function explainMovers(performers: WeeklyPerformers): Promise<{ notes: NonNullable<WeeklyPerformers["why"]>; headlines: number }> {
  const movers = [...performers.top, ...performers.worst];
  // The Friday before the window too: a Monday move often follows weekend news.
  const from = DateTime.fromISO(performers.window.start, { zone: NY }).minus({ days: 3 }).toISODate()!;
  const news = new Map<string, NewsItem[]>();
  for (const m of movers) news.set(m.ticker, await getCompanyNews(m.ticker, from, performers.window.end).catch(() => []));
  const headlines = [...news.values()].reduce((n, list) => n + list.length, 0);
  if (!headlines) return { notes: [], headlines };
  const r = await generateText({
    model: chatModel(PT_SHEET_MODEL_ID),
    instructions: whyInstructions(),
    prompt: whyPrompt(movers, news),
    // Ling's reasoning counts against this; a small budget has cut its answers off before.
    maxOutputTokens: 4000,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(90_000),
  });
  return { notes: parseWhy(r.text, movers, news), headlines };
}

/** Yahoo quotes (name, market cap) for many tickers, 100 per request. Empty when Yahoo is down: callers fall back. */
async function quotesFor(tickers: string[]): Promise<Awaited<ReturnType<typeof getQuotes>>> {
  const unique = [...new Set(tickers)];
  const out: Awaited<ReturnType<typeof getQuotes>> = {};
  for (let i = 0; i < unique.length; i += 100) {
    Object.assign(out, await getQuotes(unique.slice(i, i + 100)).catch(() => ({})));
  }
  return out;
}

/**
 * The coming week's reports: holdings and tracked sector bellwethers, plus the week's largest reporters from Finnhub (see
 * `earnings.ts`). For holdings the sheet's Earnings Date wins; the app's earnings calendar fills in any holding the sheet has
 * no date for. Without Finnhub or Yahoo the line keeps holdings and bellwethers only.
 */
async function computeEarningsItems(weekEnding: string, sheet: SheetWeeklyRead["earnings"] | null): Promise<{ items: AgendaItem[]; big: number; note: string | null }> {
  const { from, to } = agendaWeek(weekEnding);
  const [holdingEvents, bellwethers, calendar] = await Promise.all([
    listCalendarHoldingEvents(from, to),
    listBellwethers(),
    getEarningsCalendarRange(from, to).catch((e: unknown) => e as Error),
  ]);
  const sheetDated = new Set(sheet?.dated ?? []);
  const always = new Map<string, string>();
  for (const e of sheet?.rows ?? []) always.set(e.ticker, e.date);
  for (const row of holdingEvents) {
    if (!row.e.reportDate || always.has(row.h.ticker) || sheetDated.has(tickerKey(row.h.ticker))) continue;
    always.set(row.h.ticker, row.e.reportDate);
  }
  for (const b of bellwethers) {
    if (!b.reportDate || b.reportDate < from || b.reportDate > to) continue;
    if (!always.has(b.ticker)) always.set(b.ticker, b.reportDate);
  }

  const others = new Map<string, string>();
  if (!(calendar instanceof Error)) {
    for (const [symbol, events] of calendar) {
      const date = events.find((e) => e.date >= from && e.date <= to)?.date;
      if (date && US_TICKER.test(symbol) && !always.has(symbol)) others.set(symbol, date);
    }
  }
  const quotes = await quotesFor([...always.keys(), ...others.keys()]);
  const cap = (t: string) => quotes[t]?.marketCap ?? null;
  const picked = pickEarnings([
    ...[...always].map(([ticker, date]): Reporter => ({ ticker, date, cap: cap(ticker), always: true })),
    ...[...others].map(([ticker, date]): Reporter => ({ ticker, date, cap: cap(ticker) })),
  ]);
  const note =
    calendar instanceof Error
      ? `the week's largest reporters are missing: Finnhub failed (${calendar.message})`
      : others.size && !Object.keys(quotes).length
        ? "the week's largest reporters are missing: Yahoo gave no market caps"
        : null;
  return { items: picked.map((e) => ({ day: weekdayLabel(e.date), text: e.ticker })), big: picked.filter((e) => !e.always).length, note };
}

/** The week's scheduled economic releases, named and chosen the way the execs write them (see `market-news.ts`). */
async function computeMarketNewsItems(weekEnding: string): Promise<AgendaItem[]> {
  const range = agendaWeek(weekEnding);
  const feed = await getEconomicCalendar(range);
  return deckMarketNews(feed.events, range).map((e) => ({ day: weekdayLabel(e.date), text: e.name }));
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

  if (performers && agentConfigured()) {
    progress.step("explain the week's movers");
    try {
      const { notes, headlines } = await explainMovers(performers);
      performers = { ...performers, why: notes };
      update.performers = performers;
      sources = noteSource(sources, "why", { status: "ok", detail: `${notes.length} of ${performers.top.length + performers.worst.length} movers explained from ${headlines} headlines` });
    } catch (e) {
      // Optional context: the email goes out without it.
      sources = noteSource(sources, "why", { status: "failed", error: message(e) });
      progress.warn("mover notes failed", { error: message(e) });
    }
  }

  const agenda = normalizeAgenda(row.agenda);
  let earningsItems: AgendaItem[] = agenda.earnings;
  let marketNewsItems: AgendaItem[] = agenda.marketNews;

  progress.step("collect earnings for the coming week");
  try {
    const { items, big, note } = await computeEarningsItems(weekEnding, sheet && !sheet.earnings.problem ? sheet.earnings : null);
    if (!edited) earningsItems = items;
    const detail = `${items.length} reports, ${big} of them the week's largest${note ? `; ${note}` : ""}`;
    sources = noteSource(sources, "earnings", edited ? { status: "held", detail: `${detail}; the pack has exec edits` } : { status: note ? "failed" : "ok", detail, ...(note ? { error: note } : {}) });
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

  let processItems: AgendaItem[] = agenda.processUpdates;
  progress.step("read the fund calendar for the coming week");
  try {
    const calendar = await readFundCalendar();
    if (!calendar) sources = noteSource(sources, "processUpdates", { status: "held", detail: "Google Drive is not configured here" });
    else if (!calendar.files.length) {
      failed.push("processUpdates");
      sources = noteSource(sources, "processUpdates", { status: "failed", error: 'no "<Semester> <Year> Calendar.xlsx" in the Drive folder' });
    } else {
      const items = calendarProcessUpdates(calendar.entries, agendaWeek(weekEnding));
      if (!edited) processItems = items;
      const detail = `${items.length} items from ${calendar.files.join(" and ")}`;
      sources = noteSource(sources, "processUpdates", edited ? { status: "held", detail: `${detail}; the pack has exec edits` } : { status: "ok", detail });
    }
  } catch (e) {
    failed.push("processUpdates");
    sources = noteSource(sources, "processUpdates", { status: "failed", error: message(e) });
    progress.warn("fund calendar failed", { error: message(e) });
  }

  update.agenda = { earnings: earningsItems, marketNews: marketNewsItems, processUpdates: processItems };
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
