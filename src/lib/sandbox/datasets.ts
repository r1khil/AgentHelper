import "server-only";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { teams, teamSectors } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { canManageTeam, isFundWide } from "@/lib/roles";
import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import { resolvePeriod, type PeriodKey } from "@/lib/attribution/periods";
import type { GicsSector } from "@/lib/attribution/sectors";
import { loadSeries } from "@/lib/attribution/store";
import { loadSnapshot } from "@/lib/backtesting/load";
import { NY } from "@/lib/providers/calendar";
import { getAdjustedBarsRange, getDailyBars } from "@/lib/providers/yahoo";
import { sourceId, type Source } from "@/lib/providers/types";

/**
 * Named inputs for run_python. Each loader fetches through the same provider or loader the matching
 * tool or page uses (so the viewer only gets what the app would show them), renders a CSV, and returns
 * the source a citation of that data should point at.
 */

export const DATASET_RANGES = ["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "itd"] as const;
export type DatasetRange = (typeof DATASET_RANGES)[number];
export type DatasetRequest = { name: string; range?: DatasetRange };

export type Dataset = {
  /** The name the model asked for, e.g. "prices:AXP". */
  name: string;
  /** Path relative to the sandbox working directory. */
  path: string;
  columns: string[];
  rows: number;
  firstDate: string | null;
  lastDate: string | null;
  note?: string;
  content: string;
  source: Source;
};

export type DatasetContext = { viewer: CurrentUser; teamId: string };

const appUrl = (path: string) => `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${path}`;
const TICKER = /^[A-Z0-9.^=-]{1,12}$/;

type Cell = string | number | null | undefined;
export function toCsv(columns: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n") + "\n";
}

const round = (x: number | null | undefined, dp: number) => (x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(dp));

/** First calendar day a range covers, in New York time. `itd` has no fixed start (prices cap it at 5y). */
export function rangeStart(range: DatasetRange, today: DateTime = DateTime.now().setZone(NY)): string {
  const back = { "1m": { months: 1 }, "3m": { months: 3 }, "6m": { months: 6 }, "1y": { years: 1 }, "2y": { years: 2 }, "5y": { years: 5 }, itd: { years: 5 } } as const;
  if (range === "ytd") return today.startOf("year").toISODate()!;
  return today.minus(back[range]).toISODate()!;
}

/** "prices:axp" → { kind: "prices", arg: "AXP" }. Unknown names throw with the list of valid ones. */
export function parseDatasetName(raw: string): { kind: "prices" | "holdings" | "returns"; arg: string | null } {
  const [head, ...rest] = raw.trim().split(":");
  const kind = head.toLowerCase();
  const arg = rest.join(":").trim();
  if (kind === "prices") {
    const t = arg.toUpperCase();
    if (!TICKER.test(t)) throw new Error(`Dataset "${raw}": give a ticker, e.g. prices:AXP.`);
    return { kind, arg: t };
  }
  if (kind === "holdings" && !arg) return { kind, arg: null };
  if (kind === "returns" && (!arg || arg === "fund" || arg === "team")) return { kind, arg: arg || null };
  throw new Error(`Unknown dataset "${raw}". Use prices:<TICKER>, holdings, returns, returns:fund or returns:team.`);
}

export const datasetFile = (name: string) => `data/${name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}.csv`;

async function loadPrices(ticker: string, range: DatasetRange): Promise<Omit<Dataset, "name" | "path">> {
  const now = DateTime.now().setZone(NY);
  const from = rangeStart(range, now);
  const today = now.toISODate()!;
  // Today's bar is still moving until the close has settled, so it is left out like the attribution prices.
  const sessionOpen = now.hour < 16 || (now.hour === 16 && now.minute < 15);
  const calendarDays = Math.ceil(now.diff(DateTime.fromISO(from, { zone: NY }), "days").days) + 1;
  const [bars, adjusted] = await Promise.all([getDailyBars(ticker, calendarDays), getAdjustedBarsRange(ticker, from, today).catch(() => [])]);
  const adj = new Map(adjusted.map((b) => [b.date, b.close]));
  const kept = bars.filter((b) => b.date >= from && !(sessionOpen && b.date === today));
  if (!kept.length) throw new Error(`No daily prices for ${ticker} since ${from}.`);
  const columns = ["date", "open", "high", "low", "close", "adj_close", "volume"];
  const rows = kept.map((b) => [b.date, round(b.open, 4), round(b.high, 4), round(b.low, 4), round(b.close, 4), round(adj.get(b.date), 4), b.volume ?? null]);
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/history/`;
  const first = kept[0];
  const last = kept[kept.length - 1];
  return {
    columns,
    rows: rows.length,
    firstDate: first.date,
    lastDate: last.date,
    note: adj.size ? "close is split-adjusted only; adj_close also adjusts for dividends (use it for returns)." : "adj_close is unavailable for this symbol; close is split-adjusted only.",
    content: toCsv(columns, rows),
    // Same id as get_price_history's source, so both tools cite one card.
    source: { id: sourceId("yh", url), title: `${ticker} price history (Yahoo Finance)`, url, publisher: "Yahoo Finance", retrievedAt: new Date().toISOString(), excerpt: `${ticker} daily prices ${first.date} to ${last.date}: ${kept.length} sessions, last close ${round(last.close, 2)}.` },
  };
}

async function loadHoldings(ctx: DatasetContext): Promise<Omit<Dataset, "name" | "path">> {
  // The Backtesting page's snapshot: the whole Fund for execs and admins, the member's team otherwise.
  const snap = await loadSnapshot(ctx.viewer);
  const positions = snap.positions.filter((p) => p.kind !== "cash" || p.weight > 0);
  const columns = ["ticker", "name", "weight", "kind"];
  const rows = positions.map((p) => [p.ticker, p.name, round(p.weight, 6), p.kind ?? "stock"]);
  const asOf = snap.capturedAt.slice(0, 10);
  return {
    columns,
    rows: rows.length,
    firstDate: asOf,
    lastDate: asOf,
    note: `${snap.scope}: current saved weights as fractions of that portfolio (sum 1)${snap.sleeve ? "; a team sleeve is renormalized to 100% with no cash" : ", including uninvested cash"}.`,
    content: toCsv(columns, rows),
    source: {
      id: sourceId("holdings", snap.version),
      title: `${snap.scope} · current holdings and saved weights`,
      url: appUrl("/backtesting"),
      publisher: "Owl Fund holdings (saved weights)",
      publishedAt: asOf,
      retrievedAt: new Date().toISOString(),
      sourceType: "Fund holdings",
      excerpt: positions.map((p) => `${p.ticker} ${(p.weight * 100).toFixed(2)}%`).join(", ").slice(0, 360),
    },
  };
}

const PERIOD_FOR: Partial<Record<DatasetRange, PeriodKey>> = { "1m": "1m", "6m": "6m", ytd: "ytd", "1y": "1y", itd: "itd" };

async function loadReturns(ctx: DatasetContext, which: "fund" | "team" | null, range: DatasetRange): Promise<Omit<Dataset, "name" | "path">> {
  const { viewer } = ctx;
  const scope = which ?? (isFundWide(viewer) ? "fund" : "team");
  // The Attribution pages' access rules, as get_attribution applies them.
  const teamRows = await db.select({ id: teams.id, slug: teams.slug, name: teams.name }).from(teams);
  let sleeve: (typeof teamRows)[number] | undefined;
  if (scope === "fund") {
    if (!isFundWide(viewer)) throw new Error("Whole-fund returns are visible to execs and admins only; use returns:team.");
  } else {
    sleeve = teamRows.find((t) => t.id === ctx.teamId);
    if (!sleeve) throw new Error("This chat has no team, so there are no team returns.");
    if (!canManageTeam(viewer, sleeve.id)) throw new Error("Team returns are visible to the team's lead analyst, execs and admins.");
  }
  const loaded = await loadSeries(db);
  if (!loaded.inception || !loaded.latest) throw new Error("No returns yet: the trade ledger or its closing prices have not loaded.");
  const key: PeriodKey = PERIOD_FOR[range] ?? "custom";
  const from = key === "custom" ? rangeStart(range) : undefined;
  const period = resolvePeriod(key, { from, inception: loaded.inception, latest: loaded.latest });

  const result = sleeve
    ? computeTeamAttribution(loaded.series, period, sleeve.id, (await db.select().from(teamSectors)).filter((r) => r.teamId === sleeve.id).map((r) => r.sector as GicsSector))
    : computeAttribution(loaded.series, period);
  const cum = result.cumulative;
  const step = (a: number | null, b: number | null) => (a === null || b === null ? null : (1 + b) / (1 + a) - 1);
  const columns = sleeve ? ["date", "return", "sector_benchmark_return"] : ["date", "return", "sector_benchmark_return", "sp500_return"];
  const rows = cum.slice(1).map((c, k) => {
    const prev = cum[k];
    const base = [c.date, round(step(prev.portfolio, c.portfolio), 8), round(step(prev.benchmark, c.benchmark), 8)];
    if (sleeve) return base;
    const a = loaded.index.get(prev.date);
    const b = loaded.index.get(c.date);
    return [...base, round(a && b ? b / a - 1 : null, 8)];
  });
  if (!rows.length) throw new Error(`No completed sessions between ${period.start} and ${period.end}.`);

  const query = new URLSearchParams({ period: key });
  if (from) query.set("from", from);
  const path = sleeve ? `/t/${sleeve.slug}/attribution?${query}` : `/attribution?${query}`;
  const label = sleeve ? `${sleeve.name} sleeve` : "Fund";
  return {
    columns,
    rows: rows.length,
    firstDate: rows[0][0] as string,
    lastDate: rows[rows.length - 1][0] as string,
    note: `${label} daily returns as decimals (0.01 = 1%) from the trade ledger, as the Attribution page computes them${period.clamped ? "; the range starts at the Fund's inception" : ""}.${sleeve ? "" : " sp500_return is the S&P 500 price return."}`,
    content: toCsv(columns, rows),
    // Same id get_attribution gives this page and period.
    source: {
      id: sourceId("attr", `${path}:${period.start}:${period.end}`),
      title: `${label} daily returns · ${period.start} to ${period.end} close`,
      url: appUrl(path),
      publisher: "Owl Fund attribution (trade ledger)",
      publishedAt: period.end,
      retrievedAt: new Date().toISOString(),
      sourceType: "Fund attribution",
      excerpt: `${label} return ${(result.portfolioReturn * 100).toFixed(2)}% over ${rows.length} sessions, ${period.start} to ${period.end}.`,
    },
  };
}

export async function loadDataset(ctx: DatasetContext, req: DatasetRequest): Promise<Dataset> {
  const { kind, arg } = parseDatasetName(req.name);
  const name = kind === "prices" ? `prices:${arg}` : kind === "returns" ? `returns${arg ? `:${arg}` : ""}` : "holdings";
  const loaded =
    kind === "prices" ? await loadPrices(arg!, req.range ?? "1y") : kind === "holdings" ? await loadHoldings(ctx) : await loadReturns(ctx, arg as "fund" | "team" | null, req.range ?? "itd");
  return { name, path: datasetFile(name), ...loaded };
}
