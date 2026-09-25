import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { teams, teamSectors } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { canManageTeam, isFundWide } from "@/lib/roles";
import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import { PERIOD_KEYS, PERIOD_LABELS, resolvePeriod } from "@/lib/attribution/periods";
import type { GicsSector } from "@/lib/attribution/sectors";
import { loadSeries } from "@/lib/attribution/store";
import { attributionHeadline, summarizeAttribution } from "@/lib/attribution/summary";
import { qualityNotices } from "@/lib/attribution/view";
import { BENCHMARKS, type Metrics } from "@/lib/backtesting/engine";
import { loadSnapshot, resolveScenarioSnapshot, runBacktest } from "@/lib/backtesting/load";
import { MAX_SCENARIO_COMPANIES } from "@/lib/backtesting/scenario";
import { weightsFromOverrides } from "@/lib/backtesting/overrides";
import { applyTrade, type Funding } from "@/lib/backtesting/trade";
import { NY } from "@/lib/providers/calendar";
import { loadRisk } from "@/lib/risk/load";
import { DEFAULT_LOOKBACK, LOOKBACKS, type LookbackKey } from "@/lib/risk/model";
import { scenarioRisk } from "@/lib/risk/scenario";
import { summarizeRisk } from "@/lib/risk/summary";
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
 * The Fund's own performance tools: attribution (the same calculation as the Attribution pages), backtests
 * (the same engine as the Backtesting page) and risk (the Risk pages). They need the signed-in member, so they only exist in chat turns, and
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
        "Replay the current holdings over past prices with saved weights and an optional modified scenario. The scenario may add recognized company tickers and change or drop weights with explicit offsets. Fixed weights rebalance daily using Yahoo adjusted closes. Returns performance metrics and holding contributions. This sandbox never changes the real portfolio. Execs and admins backtest the Fund; everyone else their team.",
      inputSchema: z.object({
        from: iso.optional().describe("First session; defaults to three months before `to`"),
        to: iso.optional().describe("Last session; defaults to the last completed session"),
        benchmark: z.enum(Object.keys(BENCHMARKS) as [keyof typeof BENCHMARKS, ...(keyof typeof BENCHMARKS)[]]).default("SPY"),
        addedTickers: z.array(z.string()).max(MAX_SCENARIO_COMPANIES).optional().describe("Company tickers to add only to the modified scenario. Resolve them before assigning weights; each starts at 0%, so include explicit offsets in weights."),
        weights: z
          .record(z.string(), z.number().min(0).max(100))
          .optional()
          .describe("Scenario weights in percent by ticker, including CASH. Named tickers get exactly that weight; unspecified holdings keep their current weights. Supply offsetting edits so the full portfolio totals 100.00%. Omit to replay saved weights only."),
        trades: z
          .array(z.object({ ticker: z.string(), changePp: z.number().min(-100).max(100).describe("Percentage points: negative trims, positive adds"), fundFrom: z.string().describe("'cash', 'pro_rata' (the other holdings in proportion to their weights) or a holding's ticker") }))
          .max(10)
          .optional()
          .describe("Relative trades applied after `weights`, each offset automatically, e.g. [{ ticker: 'AVGO', changePp: -2, fundFrom: 'cash' }]. Easier than absolute weights for 'trim X by 2%' questions."),
      }),
      execute: async ({ from, to, benchmark, addedTickers, weights: overrides, trades }): Promise<ToolResult<unknown>> => {
        try {
          const yesterday = DateTime.now().setZone(NY).minus({ days: 1 }).toISODate()!;
          const end = to && to < yesterday ? to : yesterday;
          // Same default window as the Backtesting page: three months back from the end date.
          const start = from ?? DateTime.fromISO(end, { zone: NY }).minus({ months: 3 }).toISODate()!;
          const saved = await loadSnapshot(viewer);
          const snapshot = addedTickers?.length ? await resolveScenarioSnapshot(saved, addedTickers) : saved;
          let weights = weightsFromOverrides(snapshot.positions, overrides ?? {});
          for (const t of trades ?? []) {
            const funding: Funding = t.fundFrom === "cash" ? { kind: "cash" } : t.fundFrom === "pro_rata" ? { kind: "pro_rata" } : { kind: "ticker", ticker: t.fundFrom };
            weights = applyTrade(snapshot.positions, weights, { ticker: t.ticker, changePp: t.changePp, funding });
          }
          const [r, risk] = await Promise.all([
            runBacktest(snapshot, weights, benchmark, start, end),
            snapshot.positions.some((p) => Math.abs(weights[p.id] - p.weight) > 1e-9) ? scenarioRisk(viewer, snapshot, weights, "1y").catch(() => null) : Promise.resolve(null),
          ]);
          const changed = snapshot.positions
            .filter((p) => Math.abs(weights[p.id] - p.weight) > 1e-6)
            .map((p) => ({ ticker: p.ticker, savedPct: pct(p.weight), scenarioPct: pct(weights[p.id]) }));
          const contributions = [...r.contributions]
            .sort((a, b) => (changed.length ? Math.abs(b.delta) - Math.abs(a.delta) : Math.abs(b.original) - Math.abs(a.original)))
            .slice(0, 12)
            .map((c) => ({ ticker: c.ticker, savedContributionPct: pct(c.original), scenarioContributionPct: pct(c.modified), changePct: pct(c.delta) }));
          const source: Source = {
            id: sourceId("backtest", `${snapshot.version}:${benchmark}:${r.from}:${r.to}:${JSON.stringify(addedTickers ?? [])}:${JSON.stringify(overrides ?? {})}`),
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
              ...(risk
                ? {
                    riskImpact: {
                      method: "Today's risk of the saved vs scenario weights with the Risk page's model (1-year window of daily returns), independent of the backtest period.",
                      saved: { volatilityPct: pct(risk.before.vol), beta: +risk.before.beta.toFixed(2), trackingErrorPct: pct(risk.before.trackingError), var95Pct: pct(risk.before.var), effectivePositions: +risk.before.effectiveN.toFixed(1) },
                      scenario: { volatilityPct: pct(risk.after.vol), beta: +risk.after.beta.toFixed(2), trackingErrorPct: pct(risk.after.trackingError), var95Pct: pct(risk.after.var), effectivePositions: +risk.after.effectiveN.toFixed(1) },
                      holdings: risk.holdings.map((h) => ({ ticker: h.ticker, weightPct: `${pct(h.weightBefore)} → ${pct(h.weightAfter)}`, shareOfRiskPct: `${pct(h.shareBefore)} → ${pct(h.shareAfter)}` })),
                    },
                  }
                : {}),
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

    get_portfolio_risk: tool({
      description:
        "Risk of the Fund's current portfolio, exactly as the Risk page computes it from the trade ledger: annualized volatility, beta to the S&P 500, tracking error vs the sector benchmark, 1-day 95% value at risk and expected shortfall (in % and dollars), a beta stress test, concentration (effective number of positions, top-5 weight), each sector's weight vs the benchmark and share of risk, the holdings that contribute most risk, highly correlated pairs, and realized statistics from the Fund's own returns. Use it for questions about how risky the portfolio is, what drives its risk, concentration, diversification, beta, or how much it could lose. Scope 'fund' is the whole Fund (execs and admins); 'team' is one team's holdings as their own portfolio.",
      inputSchema: z.object({
        scope: z.enum(["fund", "team"]).default(isFundWide(viewer) ? "fund" : "team"),
        team: z.string().optional().describe("Team slug or name for scope 'team'; defaults to this chat's team"),
        lookback: z.enum(Object.keys(LOOKBACKS) as [LookbackKey, ...LookbackKey[]]).default(DEFAULT_LOOKBACK).describe("Window of daily returns: 6m, 1y or 2y"),
        holdingsLimit: z.number().int().min(3).max(30).default(10).describe("How many of the largest risk sources to list"),
      }),
      execute: async ({ scope, team, lookback, holdingsLimit }): Promise<ToolResult<unknown>> => {
        try {
          const teamRows = await db.select({ id: teams.id, slug: teams.slug, name: teams.name }).from(teams);
          let sleeve: (typeof teamRows)[number] | undefined;
          if (scope === "fund") {
            if (!isFundWide(viewer)) throw new Error("Whole-fund risk is visible to execs and admins only. Ask about your team's holdings instead (scope 'team').");
          } else {
            const q = team?.trim().toLowerCase();
            sleeve = q ? teamRows.find((t) => t.slug === q || t.name.toLowerCase() === q) : teamRows.find((t) => t.id === ctx.teamId);
            if (!sleeve) throw new Error(`No team matches "${team}". Teams: ${teamRows.map((t) => t.slug).join(", ")}.`);
            if (!canManageTeam(viewer, sleeve.id)) throw new Error("Team risk is visible to the team's lead analyst, execs and admins.");
          }
          const loaded = await loadRisk(lookback, sleeve?.id ?? null);
          if (loaded.state === "no-ledger") return { data: { note: "No trades are recorded in the ledger yet, so there is no portfolio to measure." }, sources: [] };
          if (loaded.state === "no-prices") return { data: { note: "Closing prices for the ledger have not loaded yet; risk appears after the next price run." }, sources: [] };
          const summary = summarizeRisk(loaded.report, { teamNames: new Map(teamRows.map((t) => [t.id, t.name])), holdingsLimit });
          const path = `${sleeve ? `/t/${sleeve.slug}/risk` : "/risk"}?lookback=${lookback}`;
          const source: Source = {
            id: sourceId("risk", `${path}:${loaded.report.asOf}`),
            title: `${sleeve ? `${sleeve.name} risk` : "Fund risk"} · ${LOOKBACKS[lookback].label} window · positions at ${loaded.report.asOf} close`,
            url: appUrl(path),
            publisher: "Owl Fund risk (trade ledger, Yahoo closes)",
            publishedAt: loaded.report.asOf,
            retrievedAt: new Date().toISOString(),
            sourceType: "Fund risk",
            excerpt: `Volatility ${summary.annualizedVolatilityPct}% (S&P 500 ${summary.sp500VolatilityPct}%), beta ${summary.beta}, tracking error ${summary.trackingErrorPct ?? "n/a"}%, 1-day 95% VaR ${summary.var95OneDay.pct}% ($${summary.var95OneDay.usd.toLocaleString("en-US")}).`,
          };
          return { data: { ...summary, sourceId: source.id }, sources: [source] };
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
