import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { count, desc, gte, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { changelogEntries, evidenceItems, teams } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { isFundWide } from "@/lib/roles";
import { FUND_SCOPE_SLUG, MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { listTeamMovements } from "@/lib/movements";
import { listTeamEarnings, type Actuals } from "@/lib/earnings";
import { expectationsState, prepPackWord } from "@/lib/earnings-calendar";
import { getEconomicCalendar } from "@/lib/economic-calendar/service";
import { calendarWeek, validateRange } from "@/lib/economic-calendar/dates";
import { shownActual, surprise } from "@/lib/economic-calendar/view";
import { loadLedgerRows } from "@/lib/portfolio/activity-load";
import { loadHeldTickets } from "@/lib/attribution/held-tickets";
import { loadHootFeedFor } from "@/lib/hoot/feed";
import { isOverdue as nudgeOverdue, listNudges, needsSentence, nudgeWhen } from "@/lib/today";
import { NY, todayNY } from "@/lib/providers/calendar";
import { sourceId, type Source } from "@/lib/providers/types";
import { fmtBp, fmtCurrency, fmtDate, fmtDateTime, fmtDay, fmtNumber, fmtPct, fmtTime, fmtUsd, ppToBp } from "@/lib/format";
import type { ToolResult } from "./tools";
import {
  earningsWindow,
  filterLedger,
  IMPORTANCE_FILTERS,
  importanceWord,
  LEDGER_KINDS,
  MOVEMENT_FILTERS,
  movementOverdue,
  pickEconomicEvents,
  pickMovements,
  reportTiming,
  resolveWorkspaceScope,
  signedFlow,
  tradeTotals,
} from "./workspace-shape";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const appUrl = (path: string) => `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${path}`;
const now = () => new Date().toISOString();
const num = (v: string | null) => (v === null || v === "" ? null : Number(v));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const fail = (e: unknown): ToolResult<null> => ({ data: null, sources: [], error: e instanceof Error ? e.message : String(e) });
const teamArg = z.string().optional().describe("Team slug or name, or 'fund' for every team (execs and admins); defaults to this chat's team");

/**
 * Read-only views of the workspace pages Hoot could not see: Movements, the Earnings calendar, Economic releases,
 * Activity (the trade ledger), Home's to-do list and the Changelog. Each applies its page's access rule for the member.
 */
export function makeWorkspaceTools(ctx: { viewer: CurrentUser; teamId: string | null }) {
  const { viewer } = ctx;
  const teamRows = () => db.select().from(teams).orderBy(teams.sortOrder);
  /** Where a page link in this chat opens: the chat's team, or the fund in a fund-wide chat. */
  const chatSlug = async () => (ctx.teamId ? ((await teamRows()).find((t) => t.id === ctx.teamId)?.slug ?? FUND_SCOPE_SLUG) : FUND_SCOPE_SLUG);

  return {
    get_movements: tool({
      description: `Major-movement investigations from the Movements page: sessions where a holding's return differed from the S&P 500's by at least ${MOVEMENT_THRESHOLD_PP * 100} bp. Each with the move (bp), status, due time and whether it is overdue, who completed it, the evidence gathered, and the team's write-up text when there is one. Use it for which movements are open, overdue or done, across a team or the Fund.`,
      inputSchema: z.object({
        team: teamArg,
        ticker: z.string().optional().describe("Only this holding"),
        status: z.enum(MOVEMENT_FILTERS).default("unfinished").describe("unfinished = open or in progress (what the team still owes); overdue; open; in_progress; completed; all"),
        limit: z.number().int().min(1).max(30).default(10),
      }),
      execute: async ({ team, ticker, status, limit }): Promise<ToolResult<unknown>> => {
        try {
          const scope = resolveWorkspaceScope(await teamRows(), viewer, ctx.teamId, team, "movements");
          const t = Date.now();
          const rows = (await listTeamMovements(scope.teamIds)).map(({ m, h, completedByName }) => ({ m, h, completedByName, ticker: h.ticker, status: m.status, dueAt: m.dueAt }));
          const picked = pickMovements(rows, { ticker, status, limit, now: t });
          const ids = picked.rows.map((r) => r.m.id);
          const evidence = ids.length
            ? await db.select({ movementId: evidenceItems.movementId, kind: evidenceItems.kind, n: count() }).from(evidenceItems).where(inArray(evidenceItems.movementId, ids)).groupBy(evidenceItems.movementId, evidenceItems.kind)
            : [];
          const sources: Source[] = [];
          const movements = picked.rows.map(({ m, h, completedByName }) => {
            const rel = ppToBp(num(m.relativeMovePp));
            const overdue = movementOverdue(m, t);
            const kinds = Object.fromEntries(evidence.filter((e) => e.movementId === m.id).map((e) => [e.kind, e.n]));
            const items = Object.values(kinds).reduce((s, n) => s + n, 0);
            const state =
              m.status === "completed"
                ? `completed${m.completedAt ? ` ${fmtDay(m.completedAt)}` : ""}${completedByName ? ` by ${completedByName}` : ""}`
                : `${overdue ? "overdue" : m.status === "in_progress" ? "in progress" : "open"}${m.dueAt ? `, ${overdue ? "was due" : "due"} ${fmtDateTime(m.dueAt)}` : ""}`;
            const move = m.dataQuality
              ? `no move calculated (data problem: ${m.dataQuality})`
              : `${fmtBp(rel)} vs the S&P 500 (${h.ticker} ${fmtPct(num(m.holdingReturnPct))}, S&P 500 ${fmtPct(num(m.spxReturnPct))})`;
            const source: Source = {
              id: sourceId("mvt", m.id),
              title: `${h.ticker} movement · ${fmtDay(m.sessionDate)} · ${m.dataQuality ? "data problem" : fmtBp(rel)}`,
              url: appUrl(`/t/${scope.slug}/movements/${m.id}`),
              publisher: "Owl Fund movements",
              publishedAt: m.sessionDate,
              retrievedAt: now(),
              sourceType: "Movement investigation",
              excerpt: `${h.ticker} on ${fmtDay(m.sessionDate)}: ${move}; ${state}; ${m.updateText?.trim() ? "write-up written" : "no write-up yet"}; ${items} evidence item${items === 1 ? "" : "s"}.`,
            };
            sources.push(source);
            return {
              ticker: h.ticker,
              company: h.companyName,
              ...(scope.fund ? { team: scope.teamById.get(h.teamId)?.name ?? null } : {}),
              sessionDate: m.sessionDate,
              relativeMoveBp: rel === null ? null : Math.round(rel),
              holdingReturnPct: num(m.holdingReturnPct),
              sp500ReturnPct: num(m.spxReturnPct),
              ...(m.dataQuality ? { dataProblem: m.dataQuality } : {}),
              status: m.status,
              overdue,
              dueAt: m.dueAt?.toISOString() ?? null,
              ...(m.status === "completed" ? { completedBy: completedByName, completedAt: m.completedAt?.toISOString() ?? null } : {}),
              evidence: { ready: m.evidenceStatus === "ready", items, byKind: kinds },
              writeUp: m.updateText?.trim() ? clip(m.updateText.trim(), 1500) : null,
              sourceId: source.id,
            };
          });
          const unfinished = rows.filter((r) => r.status !== "completed");
          return {
            data: {
              scope: scope.label,
              rule: `A movement is logged when a holding's daily return differs from the S&P 500's by at least ${MOVEMENT_THRESHOLD_PP * 100} bp (official closes); the write-up belongs to the holding's whole team.`,
              totals: { unfinished: unfinished.length, overdue: unfinished.filter((r) => movementOverdue(r, t)).length, completed: rows.length - unfinished.length },
              matched: picked.matched,
              movements,
            },
            sources,
          };
        } catch (e) {
          return fail(e);
        }
      },
    }),

    get_upcoming_earnings: tool({
      description:
        "The Earnings calendar page for a team or the Fund: holdings reporting in the next N days (date, confirmed or estimated, before the open or after the close, fiscal period, consensus EPS and revenue, whether the team's expectations are locked, whether Hoot's prep pack is built) and reports just in (with the actuals the app gathered). Use it for which of our holdings report soon; get_earnings_calendar is one outside ticker's next date.",
      inputSchema: z.object({
        team: teamArg,
        days: z.number().int().min(1).max(60).default(14).describe("How far ahead to look"),
        ticker: z.string().optional().describe("Only this holding"),
        recentDays: z.number().int().min(0).max(30).default(7).describe("Also list reports from this many days back"),
      }),
      execute: async ({ team, days, ticker, recentDays }): Promise<ToolResult<unknown>> => {
        try {
          const scope = resolveWorkspaceScope(await teamRows(), viewer, ctx.teamId, team, "earnings");
          const today = todayNY();
          const rows = (await listTeamEarnings(scope.teamIds)).map(({ e, h }) => ({ e, h, ticker: h.ticker, reportDate: e.reportDate, status: e.status, active: h.status === "active" }));
          const w = earningsWindow(rows, { today, days, recentDays, ticker });
          const sources: Source[] = [];
          const teamOf = (teamId: string) => (scope.fund ? { team: scope.teamById.get(teamId)?.name ?? null } : {});
          const cite = (id: string, title: string, reportDate: string, excerpt: string) => {
            const s: Source = { id: sourceId("earn", `${id}:${reportDate}`), title, url: appUrl(`/t/${scope.slug}/earnings/${id}`), publisher: "Owl Fund earnings calendar", publishedAt: reportDate, retrievedAt: now(), sourceType: "Earnings calendar", excerpt };
            sources.push(s);
            return s.id;
          };
          const upcoming = w.upcoming.map(({ e, h }) => {
            const eps = e.epsEstimate === null ? null : fmtCurrency(e.epsEstimate, e.epsCurrency);
            const revN = num(e.revenueEstimate);
            const rev = revN === null ? null : fmtCurrency(revN, e.revenueCurrency, revN >= 1e9 ? { scale: 1e9, suffix: "B" } : { scale: 1e6, suffix: "M" });
            const pack = prepPackWord({ reportDate: e.reportDate, status: e.status, prepPackAt: e.prepPackAt?.toISOString() ?? null, prepPackFailed: !!e.prepPackError }, today).text;
            const expectations = expectationsState(e).replace("_", " ");
            const timing = reportTiming(e.reportHour);
            const id = cite(
              e.id,
              `${h.ticker} earnings · ${fmtDay(e.reportDate)} (${e.dateStatus})`,
              e.reportDate,
              `${h.ticker} reports ${fmtDay(e.reportDate)}, ${timing} (${e.dateStatus})${e.fiscalPeriod ? `, ${e.fiscalPeriod}` : ""}${eps ? `; consensus EPS ${eps}` : ""}${rev ? `, revenue ${rev}` : ""}; expectations ${expectations}; prep pack: ${pack}.`,
            );
            return { ticker: h.ticker, company: h.companyName, ...teamOf(h.teamId), reportDate: e.reportDate, timing, date: e.dateStatus, fiscalPeriod: e.fiscalPeriod, consensusEps: eps, consensusRevenue: rev, expectations, prepPack: pack, sourceId: id };
          });
          const recent = w.recent.map(({ e, h }) => {
            const a = e.actuals as Actuals | null;
            const lines = (a?.rows ?? []).slice(0, 8).map((r) => ({ metric: r.metric, actual: r.actual, estimate: r.estimate, priorYear: r.priorYear }));
            const figures = lines.filter((r) => r.actual).slice(0, 3).map((r) => `${r.metric} ${r.actual}${r.estimate ? ` vs est. ${r.estimate}` : ""}`);
            const id = cite(
              e.id,
              `${h.ticker} earnings · reported ${fmtDay(e.reportDate)}`,
              e.reportDate,
              `${h.ticker} reported ${fmtDay(e.reportDate)}${e.fiscalPeriod ? ` (${e.fiscalPeriod})` : ""}: ${figures.length ? figures.join("; ") : "actuals not gathered yet"}; status ${e.status}.`,
            );
            return { ticker: h.ticker, ...teamOf(h.teamId), reportDate: e.reportDate, fiscalPeriod: e.fiscalPeriod, status: e.status, actuals: lines, teamReflection: e.reflectionAt ? "written" : "not yet", sourceId: id };
          });
          return {
            data: { scope: scope.label, today, through: w.through, upcoming, justReported: recent, ...(upcoming.length ? {} : { note: `No ${scope.label} holding has a report on the calendar through ${w.through}.` }) },
            sources,
          };
        } catch (e) {
          return fail(e);
        }
      },
    }),

    get_economic_calendar: tool({
      description:
        "The Economic releases page: scheduled macro releases (CPI, payrolls, Fed decisions, GDP…) in a window of up to 31 days, this week by default, with time (ET), importance, consensus, prior, the actual once out and how it compared, and market-implied odds where the page shows them. Use it for what is on the economic calendar or what a release printed; get_macro_series is for the history of a series. One call covers the week: the default already holds every medium and high release.",
      inputSchema: z.object({
        from: iso.optional().describe("First day; defaults to this week's Monday"),
        to: iso.optional().describe("Last day, at most 31 days after from; defaults to a week from `from`"),
        importance: z.enum(IMPORTANCE_FILTERS).default("medium").describe("all, medium (medium and high) or high"),
        search: z.string().optional().describe("Only releases whose name contains this, e.g. 'CPI'"),
        limit: z.number().int().min(1).max(100).default(60),
      }),
      execute: async ({ from, to, importance, search, limit }): Promise<ToolResult<unknown>> => {
        try {
          const range = from || to ? validateRange(from ?? to!, to ?? DateTime.fromISO(from!, { zone: NY }).plus({ days: 6 }).toISODate()!) : calendarWeek();
          const [feed, slug] = await Promise.all([getEconomicCalendar(range), chatSlug()]);
          const t = Date.now();
          const picked = pickEconomicEvents(feed.events, { importance, search, limit });
          const sources: Source[] = [];
          const events = picked.events.map((e) => {
            const actual = shownActual(e, t);
            const vs = surprise(actual, e.estimate);
            const time = e.timestamp ? fmtTime(e.timestamp) : e.time;
            const name = `${e.name}${e.period ? ` (${e.period})` : ""}`;
            const odds = e.marketImplied ? `${e.marketImplied.value} (${e.marketImplied.detail}, ${e.marketImplied.source})` : null;
            const figures = [actual !== null ? `actual ${actual}` : "not released yet", e.estimate ? `consensus ${e.estimate}` : null, e.previous ? `prior ${e.previous}` : null, odds ? `market-implied ${odds}` : null].filter(Boolean).join(", ");
            const source: Source = {
              id: sourceId("econ", `${e.id}:${actual ?? ""}`),
              title: `${name} · ${fmtDay(e.date)}`,
              url: appUrl(`/t/${slug}/economic-calendar?day=${e.date}`),
              publisher: e.source ?? feed.provider,
              publishedAt: e.timestamp ?? e.date,
              retrievedAt: feed.fetchedAt,
              sourceType: "Economic calendar",
              excerpt: `${name} ${fmtDay(e.date)} ${time}: ${figures}${vs && vs.dir !== "none" ? ` (${vs.text})` : ""}; ${importanceWord(e.importance)} importance.`,
            };
            sources.push(source);
            return {
              date: e.date,
              time,
              name: e.name,
              period: e.period,
              importance: importanceWord(e.importance),
              actual,
              consensus: e.estimate,
              ...(e.estimateSource ? { consensusFrom: e.estimateSource } : {}),
              prior: e.previous,
              ...(e.previousBeforeRevision ? { priorBeforeRevision: e.previousBeforeRevision } : {}),
              ...(vs && vs.dir !== "none" ? { vsConsensus: vs.text } : {}),
              ...(odds ? { marketImplied: odds } : {}),
              unit: e.unit ?? null,
              sourceId: source.id,
            };
          });
          return {
            data: {
              from: range.from,
              to: range.to,
              provider: feed.provider,
              fetchedAt: fmtDateTime(feed.fetchedAt),
              ...(feed.stale || feed.coverage?.status === "partial" ? { coverage: feed.coverage?.message ?? "Some sources were unavailable." } : {}),
              matched: picked.matched,
              ...(picked.belowImportance ? { hiddenLowerImportance: picked.belowImportance } : {}),
              events,
            },
            sources,
          };
        } catch (e) {
          return fail(e);
        }
      },
    }),

    get_ledger: tool({
      description:
        "The trade ledger from Portfolio · Activity (execs and admins only): recorded trades (date, ticker, buy or sell, shares as executed, price, fees, note, who recorded it), cash movements, per-ticker totals with average buy and sell prices, and emailed tickets Hoot held back for a check. Use it for when the Fund bought or sold something and at what price.",
      inputSchema: z.object({
        ticker: z.string().optional().describe("Only this ticker's trades (drops cash rows)"),
        from: iso.optional(),
        to: iso.optional(),
        kind: z.enum(LEDGER_KINDS).default("all"),
        includeVoided: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(25).describe("Newest rows to list"),
      }),
      execute: async ({ ticker, from, to, kind, includeVoided, limit }): Promise<ToolResult<unknown>> => {
        try {
          if (!isFundWide(viewer)) throw new Error("The trade ledger (Portfolio · Activity) is visible to execs and admins only.");
          const t = ticker?.trim().toUpperCase();
          const [rows, held] = await Promise.all([loadLedgerRows(), kind === "cash" ? Promise.resolve([]) : loadHeldTickets().catch(() => [])]);
          const f = filterLedger(rows, { ticker: t, from, to, kind, includeVoided });
          const url = appUrl("/attribution/ledger");
          const sources: Source[] = [];
          const trades = f.trades.slice(0, limit).map((x) => {
            const value = x.shares * x.price;
            const opening = x.kind === "opening";
            // The opening snapshot is what was already held when the ledger started, at that day's close: not a purchase.
            const what = opening ? `Held ${fmtNumber(x.shares)} ${x.ticker} when the ledger opened ${fmtDate(x.date)}, at that close of ${fmtUsd(x.price)} (opening position, not a purchase)` : `${x.side.toUpperCase()} ${fmtNumber(x.shares)} ${x.ticker} @ ${fmtUsd(x.price)} on ${fmtDate(x.date)}`;
            const source: Source = {
              id: sourceId("ledger", x.id),
              title: opening ? `Ledger · Opening position ${fmtNumber(x.shares)} ${x.ticker} · ${fmtDate(x.date)}` : `Ledger · ${x.side === "buy" ? "Bought" : "Sold"} ${fmtNumber(x.shares)} ${x.ticker} at ${fmtUsd(x.price)} · ${fmtDate(x.date)}`,
              url,
              publisher: "Owl Fund trade ledger",
              publishedAt: x.date,
              retrievedAt: now(),
              sourceType: "Trade ledger",
              excerpt: `${what} (${fmtUsd(value)})${x.fees ? `, fees ${fmtUsd(x.fees)}` : ""}${x.voided ? "; VOIDED" : ""}${x.note && !opening ? `; ${clip(x.note, 80)}` : ""}.`,
            };
            sources.push(source);
            return {
              date: x.date,
              ticker: x.ticker,
              ...(opening ? { entry: "opening position: already held when the ledger started, priced at that day's close; not a purchase" } : { side: x.side }),
              shares: x.shares,
              price: x.price,
              value: +value.toFixed(2),
              fees: x.fees,
              ...(x.voided ? { voided: true } : {}),
              note: x.note,
              recordedBy: x.by,
              sourceId: source.id,
            };
          });
          const flows = f.flows.slice(0, Math.max(0, limit - trades.length)).map((x) => {
            const amount = signedFlow(x);
            const source: Source = {
              id: sourceId("ledger", x.id),
              title: `Ledger · ${x.kind} · ${fmtDate(x.date)}`,
              url,
              publisher: "Owl Fund trade ledger",
              publishedAt: x.date,
              retrievedAt: now(),
              sourceType: "Trade ledger",
              excerpt: `${x.kind} ${fmtUsd(amount)} on ${fmtDate(x.date)}${x.voided ? "; VOIDED" : ""}${x.note ? `; ${clip(x.note, 80)}` : ""}.`,
            };
            sources.push(source);
            return { date: x.date, kind: x.kind, amount, countsAsPerformance: x.kind === "fee" || x.kind === "interest", ...(x.voided ? { voided: true } : {}), note: x.note, recordedBy: x.by, sourceId: source.id };
          });
          const heldNow = held.filter((h) => !t || h.ticker === t);
          if (heldNow.length)
            sources.push({
              id: sourceId("held", heldNow.map((h) => h.id).join(",")),
              title: `Tickets held for a check · ${heldNow.length}`,
              url,
              publisher: "Owl Fund trade ledger",
              retrievedAt: now(),
              sourceType: "Trade ledger",
              excerpt: heldNow.map((h) => `${h.side.toUpperCase()} ${fmtNumber(h.shares)} ${h.ticker} @ ${fmtUsd(h.price)} on ${fmtDate(h.date)} held: ${h.why}`).join(" "),
            });
          return {
            data: {
              method: "Shares and prices as executed, not split-adjusted. An opening position is what the Fund already held when the ledger started, at that day's close: say so, never call it a purchase or its price a cost. Deposits and withdrawals are not counted as performance.",
              matched: { trades: f.trades.length, cash: f.flows.length },
              ...(t ? { totals: tradeTotals(f.trades) } : {}),
              trades,
              cash: flows,
              ...(heldNow.length ? { heldTickets: heldNow.map((h) => ({ date: h.date, side: h.side, shares: h.shares, ticker: h.ticker, price: h.price, from: h.from, why: h.why })) } : {}),
            },
            sources,
          };
        } catch (e) {
          return fail(e);
        }
      },
    }),

    get_my_todos: tool({
      description:
        "What needs this member now, as Home's 'Needs you' list shows it: movement write-ups due or overdue, reports coming up, sell-side briefs ready, thesis and model proposals to review, the weekly pack, each with when it is due. Use it for what do I need to do, what's due, or what's on my plate.",
      inputSchema: z.object({}),
      execute: async (): Promise<ToolResult<unknown>> => {
        try {
          const all = await teamRows();
          const teamList = isFundWide(viewer) ? all : viewer.team ? [viewer.team] : [];
          const feed = await loadHootFeedFor(viewer, { teamList, scope: await chatSlug() });
          const at = new Date();
          const items = listNudges(feed.nudges);
          const sources: Source[] = [];
          const todos = items.map((n) => {
            const when = nudgeWhen(n, at);
            const source: Source = {
              id: sourceId("todo", n.id),
              title: n.title,
              url: appUrl(n.href),
              publisher: "Owl Fund · Home",
              publishedAt: n.at,
              retrievedAt: now(),
              sourceType: "To-do",
              excerpt: `${when}: ${n.title}.${n.detail ? ` ${n.detail}` : ""}`,
            };
            sources.push(source);
            return { kind: n.kind, title: n.title, when, ...(n.at ? { dueOrSince: n.at } : {}), ...(nudgeOverdue(n) ? { overdue: true } : {}), sourceId: source.id };
          });
          return { data: { summary: needsSentence(todos.length) ?? "Nothing needs this member right now.", marketOpen: feed.marketOpen, todos }, sources };
        } catch (e) {
          return fail(e);
        }
      },
    }),

    get_whats_new: tool({
      description: "The Changelog (execs and admins only): what changed in the app, one entry per merged change with its headline and plain-English summary, newest first. Use it for what's new or what changed in the app.",
      inputSchema: z.object({
        since: iso.optional().describe("Changes merged on or after this day; defaults to a week ago"),
        limit: z.number().int().min(1).max(50).default(30),
      }),
      execute: async ({ since, limit }): Promise<ToolResult<unknown>> => {
        try {
          if (!isFundWide(viewer)) throw new Error("The Changelog is visible to execs and admins only.");
          const from = since ?? DateTime.fromISO(todayNY(), { zone: NY }).minus({ days: 7 }).toISODate()!;
          const rows = await db
            .select()
            .from(changelogEntries)
            .where(gte(changelogEntries.mergedAt, DateTime.fromISO(from, { zone: NY }).toJSDate()))
            .orderBy(desc(changelogEntries.mergedAt), desc(changelogEntries.prNumber))
            .limit(limit + 1);
          const sources: Source[] = [];
          const entries = rows.slice(0, limit).map((r) => {
            const summary = clip(r.summary.trim(), 450);
            const source: Source = {
              id: sourceId("chg", String(r.prNumber)),
              title: `Changelog · ${r.headline}`,
              url: appUrl("/changelog"),
              publisher: "Owl Fund changelog",
              publishedAt: r.mergedAt.toISOString(),
              retrievedAt: now(),
              sourceType: "Changelog",
              excerpt: `${fmtDay(r.mergedAt)}: ${r.headline}. ${summary}`,
            };
            sources.push(source);
            return { merged: fmtDay(r.mergedAt), headline: r.headline, summary, pr: r.prNumber, sourceId: source.id };
          });
          return { data: { since: from, entries, ...(rows.length > limit ? { more: true } : {}), ...(entries.length ? {} : { note: `Nothing merged since ${fmtDate(from)}.` }) }, sources };
        } catch (e) {
          return fail(e);
        }
      },
    }),
  };
}
