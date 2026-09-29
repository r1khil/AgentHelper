import { DateTime } from "luxon";
import type { Profile } from "@/db/schema";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { canAccessTeam, isFundWide } from "@/lib/roles";
import { NY } from "@/lib/providers/calendar";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import type { FlowIn, TradeIn } from "@/lib/portfolio/activity";

// Pure: the access rules and filters behind Hoot's workspace tools (workspace-tools.ts), testable without a database.

export type ScopeTeam = { id: string; slug: string; name: string };
export type WorkspaceScope = { slug: string; label: string; teamIds: string[]; teamById: Map<string, ScopeTeam>; fund: boolean };

const FUND_WORDS = new Set([FUND_SCOPE_SLUG, "whole fund", "the fund", "all", "all teams"]);

/**
 * The scope a Movements or Earnings question is about, under those pages' rule: a team's page for its members, execs
 * and admins; the whole Fund for execs and admins. `asked` is a team slug or name, or "fund"; left out, it is the
 * chat's team, or the whole Fund in a fund-wide chat.
 */
export function resolveWorkspaceScope(all: ScopeTeam[], viewer: Pick<Profile, "role" | "teamId">, chatTeamId: string | null, asked: string | undefined, what: string): WorkspaceScope {
  const q = asked?.trim().toLowerCase();
  if ((q && FUND_WORDS.has(q)) || (!q && !chatTeamId)) {
    if (!isFundWide(viewer)) throw new Error(`The whole Fund's ${what} are visible to execs and admins only; ask about your team's instead.`);
    return { slug: FUND_SCOPE_SLUG, label: "Whole fund", teamIds: all.map((t) => t.id), teamById: new Map(all.map((t) => [t.id, t])), fund: true };
  }
  const team = q ? all.find((t) => t.slug === q || t.name.toLowerCase() === q) : all.find((t) => t.id === chatTeamId);
  if (!team) throw new Error(`No team matches "${asked}". Teams: ${all.map((t) => t.slug).join(", ")}${isFundWide(viewer) ? `, or "${FUND_SCOPE_SLUG}" for every team` : ""}.`);
  if (!canAccessTeam(viewer, team.id)) throw new Error(`${team.name}'s ${what} are visible to that team, execs and admins only.`);
  return { slug: team.slug, label: team.name, teamIds: [team.id], teamById: new Map([[team.id, team]]), fund: false };
}

/* ------------------------------------------------------------------------------------------------ movements */

export const MOVEMENT_FILTERS = ["unfinished", "overdue", "open", "in_progress", "completed", "all"] as const;
export type MovementFilter = (typeof MOVEMENT_FILTERS)[number];
type MovementStatus = "open" | "in_progress" | "completed";

/** The Movements page's rule: an unfinished write-up past its due time. */
export function movementOverdue(m: { status: MovementStatus; dueAt: Date | null }, now: number) {
  return m.status !== "completed" && !!m.dueAt && m.dueAt.getTime() < now;
}

/**
 * The movements that match, in the page's order (unfinished first, newest session first), and how many matched
 * before `limit`. "unfinished" is open or in progress, as the page counts what a team still owes.
 */
export function pickMovements<T extends { ticker: string; status: MovementStatus; dueAt: Date | null }>(rows: T[], o: { ticker?: string; status: MovementFilter; limit: number; now: number }) {
  const t = o.ticker?.trim().toUpperCase();
  const keep = (m: T) => {
    if (t && m.ticker !== t) return false;
    if (o.status === "all") return true;
    if (o.status === "unfinished") return m.status !== "completed";
    if (o.status === "overdue") return movementOverdue(m, o.now);
    return m.status === o.status;
  };
  const matched = rows.filter(keep);
  return { rows: matched.slice(0, o.limit), matched: matched.length };
}

/* ------------------------------------------------------------------------------------------------- earnings */

type ReportStatus = "upcoming" | "reported" | "reviewed";

const plusDays = (iso: string, n: number) => DateTime.fromISO(iso, { zone: NY }).plus({ days: n }).toISODate()!;

/**
 * The Earnings page's reports split in two: those still to come within `days` (active holdings only, soonest first) and
 * those just in, from the last `recentDays` (newest first). A report dated today stays upcoming until it is marked reported.
 */
export function earningsWindow<T extends { ticker: string; reportDate: string; status: ReportStatus; active: boolean }>(rows: T[], o: { today: string; days: number; recentDays: number; ticker?: string }) {
  const t = o.ticker?.trim().toUpperCase();
  const mine = rows.filter((r) => !t || r.ticker === t);
  const until = plusDays(o.today, o.days);
  const since = plusDays(o.today, -o.recentDays);
  const upcoming = mine
    .filter((r) => r.active && r.status === "upcoming" && r.reportDate >= o.today && r.reportDate <= until)
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.ticker.localeCompare(b.ticker));
  const recent = mine
    .filter((r) => r.reportDate >= since && r.reportDate <= o.today && (r.status !== "upcoming" || r.reportDate < o.today))
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.ticker.localeCompare(b.ticker));
  return { upcoming, recent, through: until, since };
}

/** Finnhub's report hour in words. */
export function reportTiming(hour: string | null) {
  if (hour === "bmo") return "before the open";
  if (hour === "amc") return "after the close";
  if (hour === "dmh") return "during market hours";
  return "time not announced";
}

/* ------------------------------------------------------------------------------------------ economic calendar */

export const IMPORTANCE_FILTERS = ["all", "medium", "high"] as const;
export type ImportanceFilter = (typeof IMPORTANCE_FILTERS)[number];

export const importanceWord = (i: EconomicEvent["importance"]) => (i === 3 ? "high" : i === 2 ? "medium" : i === 1 ? "low" : "unrated");

/** The page's importance chips (All, Medium+, High) and search box, then a cap. `belowImportance` counts what the chip hid. */
export function pickEconomicEvents(events: EconomicEvent[], o: { importance: ImportanceFilter; search?: string; limit: number }) {
  const q = o.search?.trim().toLowerCase();
  const searched = q ? events.filter((e) => [e.name, e.category, e.period].some((s) => s?.toLowerCase().includes(q))) : events;
  const min = o.importance === "high" ? 3 : o.importance === "medium" ? 2 : 0;
  const kept = searched.filter((e) => (e.importance ?? 0) >= min);
  return { events: kept.slice(0, o.limit), matched: kept.length, belowImportance: searched.length - kept.length };
}

/* --------------------------------------------------------------------------------------------------- ledger */

export const LEDGER_KINDS = ["all", "trades", "cash"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** The Activity page's rows narrowed to a ticker, a date range and a kind, newest first. Cash has no ticker, so a ticker drops it. */
export function filterLedger(rows: { trades: TradeIn[]; flows: FlowIn[] }, o: { ticker?: string; from?: string; to?: string; kind: LedgerKind; includeVoided: boolean }) {
  const t = o.ticker?.trim().toUpperCase();
  const inRange = (d: string) => (!o.from || d >= o.from) && (!o.to || d <= o.to);
  const byNewest = <R extends { date: string; createdAt: string }>(a: R, b: R) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  const trades = o.kind === "cash" ? [] : rows.trades.filter((x) => (o.includeVoided || !x.voided) && (!t || x.ticker === t) && inRange(x.date)).sort(byNewest);
  const flows = o.kind === "trades" || t ? [] : rows.flows.filter((x) => (o.includeVoided || !x.voided) && inRange(x.date)).sort(byNewest);
  return { trades, flows };
}

export type TradeTotals = {
  ticker: string;
  trades: number;
  /** The position the ledger opened with: what was already held that day, priced at that close. Not a purchase. */
  opening: { date: string; shares: number; price: number } | null;
  sharesBought: number;
  sharesSold: number;
  netShares: number;
  avgBuyPrice: number | null;
  avgSellPrice: number | null;
  first: string;
  last: string;
};

/**
 * Per ticker: the opening position, then the shares bought and sold since with their share-weighted average prices,
 * and the first and last date. The opening snapshot is kept apart: its price is that day's close, not a cost, so
 * folding it into the average buy price would misstate what the Fund paid. Voided rows don't count.
 */
export function tradeTotals(trades: TradeIn[]): TradeTotals[] {
  const by = new Map<string, TradeIn[]>();
  for (const x of trades) if (!x.voided) by.set(x.ticker, [...(by.get(x.ticker) ?? []), x]);
  const sum = (rows: TradeIn[]) => rows.reduce((s, r) => s + r.shares, 0);
  const avg = (rows: TradeIn[]) => {
    const shares = sum(rows);
    return shares ? +(rows.reduce((s, r) => s + r.shares * r.price, 0) / shares).toFixed(4) : null;
  };
  return [...by.entries()].map(([ticker, rows]) => {
    const open = rows.filter((r) => r.kind === "opening" && r.side === "buy");
    const buys = rows.filter((r) => r.kind !== "opening" && r.side === "buy");
    const sells = rows.filter((r) => r.side === "sell");
    const dates = rows.map((r) => r.date).sort();
    const openShares = sum(open);
    return {
      ticker,
      trades: rows.length,
      opening: open.length ? { date: open.map((r) => r.date).sort()[0], shares: openShares, price: avg(open)! } : null,
      sharesBought: sum(buys),
      sharesSold: sum(sells),
      netShares: +(openShares + sum(buys) - sum(sells)).toFixed(6),
      avgBuyPrice: avg(buys),
      avgSellPrice: avg(sells),
      first: dates[0],
      last: dates.at(-1)!,
    };
  });
}

/** Cash in or out of the account, signed; only deposits and withdrawals are left out of performance. */
export function signedFlow(f: Pick<FlowIn, "kind" | "amount">) {
  return f.kind === "deposit" || f.kind === "interest" ? f.amount : -f.amount;
}
