import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { teams, teamSectors } from "@/db/schema";
import { canManageTeam, isFundWide, type CurrentUser } from "@/lib/auth";
import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import { PERIOD_KEYS, PERIOD_LABELS, resolvePeriod } from "@/lib/attribution/periods";
import type { GicsSector } from "@/lib/attribution/sectors";
import { loadSeries } from "@/lib/attribution/store";
import { attributionHeadline, summarizeAttribution } from "@/lib/attribution/summary";
import { qualityNotices } from "@/lib/attribution/view";
import { BENCHMARKS, type Metrics } from "@/lib/backtesting/engine";
import { loadSnapshot, runBacktest } from "@/lib/backtesting/load";
import { weightsFromOverrides } from "@/lib/backtesting/overrides";
import { presetStart } from "@/lib/backtesting/scenario";
import { NY } from "@/lib/providers/calendar";
import { sourceId, type Source } from "@/lib/providers/types";
import type { ToolResult } from "./tools";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const appUrl = (path: string) => `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${path}`;
const pct = (x: number | null) => (x === null ? null : +(x * 100).toFixed(2));

function metricsOut(m: Metrics) {
  return {
    totalReturnPct: pct(m.totalReturn),
    annualizedVolatilityPct: pct(m.volatility),
    maxDrawdownPct: pct(m.maxDrawdown),
    upCapture: m.upCapture === null ? null : +m.upCapture.toFixed(2),
    downCapture: m.downCapture === null ? null : +m.downCapture.toFixed(2),
    daysAheadOfBenchmark: m.outDays,
    daysBehindBenchmark: m.underDays,
  };
}

/**
 * The Fund's own performance tools: attribution (the same calculation as the Attribution pages) and backtests
 * (the same engine as the Backtesting page). They need the signed-in member, so they only exist in chat turns, and
 * they apply the pages' access rules: fund attribution for execs and admins, a team's for its lead too.
 */
export function makePortfolioTools(ctx: { viewer: CurrentUser; teamId: string }) {
  const { viewer } = ctx;

  return {
    get_attribution: tool({
      description:
        "The Fund's performance attribution, exactly as the Attribution page computes it from the trade ledger: return vs the S&P 500 (price return), active return vs the sector benchmark split into allocation, selection and interaction (Brinson-Fachler, bps), every sector's effects, the top and bottom contributing holdings (contribution in bps), team contributions, and day-by-day returns for periods up to about a month. Use it for any question about how the Fund or a team performed, what drove over- or underperformance, or which holdings or sectors helped or hurt. Scope 'fund' is the whole Fund (execs and admins); 'team' is one team's sleeve. Periods end at the last completed close.",
      inputSchema: z.object({
        scope: z.enum(["fund", "team"]).default(isFundWide(viewer) ? "fund" : "team"),
        team: z.string().optional().describe("Team slug or name for scope 'team'; defaults to this chat's team"),
        period: z.enum(PERIOD_KEYS).default("1d").describe("1d = the last completed session (\"today\" once the market has closed), 7d, 1m, 6m, ytd, 1y, itd = since inception, custom = from/to"),
        from: iso.optional().describe("custom only: first session to include"),
        to: iso.optional().describe("custom only: last session to include"),
        holdingsLimit: z.number().int().min(3).max(25).default(8).describe("How many top and bottom contributors to list"),
      }),
      execute: async ({ scope, team, period: key, from, to, holdingsLimit }): Promise<ToolResult<unknown>> => {
        try {
          const teamRows = await db.select({ id: teams.id, slug: teams.slug, name: teams.name }).from(teams);
          const teamNames = new Map(teamRows.map((t) => [t.id, t.name]));
          let sleeve: (typeof teamRows)[number] | undefined;
          if (scope === "fund") {
            if (!isFundWide(viewer)) throw new Error("Whole-fund attribution is visible to execs and admins only. Ask about your team's sleeve instead (scope 'team').");
          } else {
            const q = team?.trim().toLowerCase();
            sleeve = q ? teamRows.find((t) => t.slug === q || t.name.toLowerCase() === q) : teamRows.find((t) => t.id === ctx.teamId);
            if (!sleeve) throw new Error(`No team matches "${team}". Teams: ${teamRows.map((t) => t.slug).join(", ")}.`);
            if (!canManageTeam(viewer, sleeve.id)) throw new Error("Team attribution is visible to the team's lead analyst, execs and admins.");
          }

          const loaded = await loadSeries(db);
          if (!loaded.inception) return { data: { note: "No trades are recorded in the ledger yet, so there is no attribution." }, sources: [] };
          if (!loaded.latest) return { data: { note: "Closing prices for the ledger have not loaded yet; attribution appears after the next price run." }, sources: [] };
          const period = resolvePeriod(key, { from, to, inception: loaded.inception, latest: loaded.latest });
          const notices = qualityNotices(loaded, period, { canEdit: false }).map((n) => n.text);

          let summary;
          if (sleeve) {
            const sectors = (await db.select().from(teamSectors)).filter((r) => r.teamId === sleeve.id).map((r) => r.sector as GicsSector);
            const result = computeTeamAttribution(loaded.series, period, sleeve.id, sectors);
            summary = summarizeAttribution({ scope: "team", teamName: sleeve.name, teamSectors: sectors, period, result, teamNames, holdingsLimit, notices });
          } else {
            const result = computeAttribution(loaded.series, period);
            summary = summarizeAttribution({ scope: "fund", period, result, index: loaded.index, teamNames, holdingsLimit, notices });
          }

          const query = new URLSearchParams({ period: key });
          if (key === "custom") {
            if (from) query.set("from", from);
            if (to) query.set("to", to);
          }
          const path = sleeve ? `/t/${sleeve.slug}/attribution?${query}` : `/attribution?${query}`;
          const title = `${sleeve ? `${sleeve.name} attribution` : "Fund attribution"} · ${PERIOD_LABELS[key]} · through ${period.end} close`;
          const source: Source = {
            id: sourceId("attr", `${path}:${period.start}:${period.end}`),
            title,
            url: appUrl(path),
            publisher: "Owl Fund attribution (trade ledger)",
            publishedAt: period.end,
            retrievedAt: new Date().toISOString(),
            sourceType: "Fund attribution",
            excerpt: attributionHeadline(summary).slice(0, 360),
          };
          return { data: { ...summary, sourceId: source.id }, sources: [source] };
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    run_backtest: tool({
      description:
        "Replay the current holdings over past prices with the saved weights and, optionally, a changed set of weights, exactly as the Backtesting page does (fixed weights rebalanced daily, Yahoo adjusted closes, dividends included). Returns total return, volatility, max drawdown, up/down capture and days ahead of the benchmark for the saved and the scenario portfolio and the benchmark, plus each holding's contribution and the change the scenario made. A sandbox: it never changes the real portfolio. Execs and admins backtest the whole Fund; everyone else their team.",
      inputSchema: z.object({
        from: iso.optional().describe("First session; defaults to three months before `to`"),
        to: iso.optional().describe("Last session; defaults to the last completed session"),
        benchmark: z.enum(Object.keys(BENCHMARKS) as [keyof typeof BENCHMARKS, ...(keyof typeof BENCHMARKS)[]]).default("SPY"),
        weights: z
          .record(z.string(), z.number().min(0).max(100))
          .optional()
          .describe("Scenario weights in percent by ticker, e.g. {\"NVDA\": 10, \"XOM\": 0}. Named tickers get exactly that weight; the other holdings keep their saved proportions of the rest. Omit to replay the saved weights only."),
      }),
      execute: async ({ from, to, benchmark, weights: overrides }): Promise<ToolResult<unknown>> => {
        try {
          const yesterday = DateTime.now().setZone(NY).minus({ days: 1 }).toISODate()!;
          const end = to && to < yesterday ? to : yesterday;
          const start = from ?? presetStart("3M", end);
          const snapshot = await loadSnapshot(viewer);
          const weights = weightsFromOverrides(snapshot.positions, overrides ?? {});
          const r = await runBacktest(snapshot, weights, benchmark, start, end);
          const changed = snapshot.positions
            .filter((p) => Math.abs(weights[p.id] - p.weight) > 1e-6)
            .map((p) => ({ ticker: p.ticker, savedPct: pct(p.weight), scenarioPct: pct(weights[p.id]) }));
          const contributions = [...r.contributions]
            .sort((a, b) => (changed.length ? Math.abs(b.delta) - Math.abs(a.delta) : Math.abs(b.original) - Math.abs(a.original)))
            .slice(0, 12)
            .map((c) => ({ ticker: c.ticker, savedContributionPct: pct(c.original), scenarioContributionPct: pct(c.modified), changePct: pct(c.delta) }));
          const source: Source = {
            id: sourceId("backtest", `${snapshot.version}:${benchmark}:${r.from}:${r.to}:${JSON.stringify(overrides ?? {})}`),
            title: `Backtest · ${snapshot.scope} · ${r.from} to ${r.to} vs ${benchmark}${changed.length ? ` · ${changed.length} weight${changed.length === 1 ? "" : "s"} changed` : ""}`,
            url: appUrl("/backtesting"),
            publisher: "Owl Fund backtest (Yahoo adjusted closes)",
            publishedAt: r.to,
            retrievedAt: new Date().toISOString(),
            sourceType: "Backtest",
            excerpt: `Saved weights ${pct(r.original.totalReturn)}%${changed.length ? `, scenario ${pct(r.modified.totalReturn)}%` : ""}, ${benchmark} ${pct(r.benchmarkMetrics.totalReturn)}% total return, ${r.from} to ${r.to}.`,
          };
          return {
            data: {
              scope: snapshot.scope,
              baseClose: r.baseline,
              from: r.from,
              to: r.to,
              sessions: r.days.length,
              benchmark: BENCHMARKS[benchmark],
              changedWeights: changed,
              saved: metricsOut(r.original),
              ...(changed.length ? { scenario: metricsOut(r.modified) } : {}),
              benchmarkMetrics: metricsOut(r.benchmarkMetrics),
              contributions,
              method: "Fixed weights rebalanced daily; contributions are each holding's share of the total return, in percentage points.",
              sourceId: source.id,
            },
            sources: [source],
          };
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
