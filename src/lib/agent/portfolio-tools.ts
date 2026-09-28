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
import { liveHeadline, summarizeLive } from "@/lib/attribution/live-summary";
import { loadLiveSnapshot } from "@/lib/attribution/live-load";
import { qualityNotices } from "@/lib/attribution/view";
import { defaultWindow } from "@/lib/backtesting/default-run";
import { BENCHMARKS, type Metrics } from "@/lib/backtesting/engine";
import { loadSnapshot, resolveScenarioSnapshot, runBacktest } from "@/lib/backtesting/load";
import { MAX_SCENARIO_COMPANIES } from "@/lib/backtesting/scenario";
import { weightsFromOverrides } from "@/lib/backtesting/overrides";
import { applyTrade, type Funding } from "@/lib/backtesting/trade";
import { NY } from "@/lib/providers/calendar";
import { loadRisk } from "@/lib/risk/load";
import { DEFAULT_LOOKBACK, LOOKBACKS, type LookbackKey } from "@/lib/risk/model";
import { scenarioRisk } from "@/lib/risk/scenario";
import { loadStressTests } from "@/lib/risk/stress-load";
import { loadLookthrough } from "@/lib/risk/lookthrough-load";
import { summarizeLookthrough, summarizeRisk, summarizeStress } from "@/lib/risk/summary";
import { sourceId, type Source } from "@/lib/providers/types";
import type { ToolResult } from "./tools";
import { fmtAccounting, fmtBp, fmtPct, fmtUsd, ppToBp } from "@/lib/format";

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

  /** The Attribution pages' access rule: the whole Fund for execs and admins, a team's sleeve for its lead too. */
  async function resolveSleeve(scope: "fund" | "team", team: string | undefined, what: string) {
    const teamRows = await db.select({ id: teams.id, slug: teams.slug, name: teams.name }).from(teams);
    const teamNames = new Map(teamRows.map((t) => [t.id, t.name]));
    if (scope === "fund") {
      if (!isFundWide(viewer)) throw new Error(`Whole-fund ${what} is visible to execs and admins only. Ask about your team's sleeve instead (scope 'team').`);
      return { sleeve: undefined, teamNames };
    }
    const q = team?.trim().toLowerCase();
    const sleeve = q ? teamRows.find((t) => t.slug === q || t.name.toLowerCase() === q) : teamRows.find((t) => t.id === ctx.teamId);
    if (!sleeve) throw new Error(`No team matches "${team}". Teams: ${teamRows.map((t) => t.slug).join(", ")}.`);
    if (!canManageTeam(viewer, sleeve.id)) throw new Error(`Team ${what} is visible to the team's lead analyst, execs and admins.`);
    return { sleeve, teamNames };
  }

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
          const { sleeve, teamNames } = await resolveSleeve(scope, team, "attribution");

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

    get_daily_performance: tool({
      description:
        "Today's performance as the Daily page shows it, live during market hours: the Fund's (or a team's) return and P&L so far from the prior close, the S&P 500 and Dow, active vs the S&P 500 and vs the sector benchmark split into allocation, selection and interaction (bps), every sector's effects, stocks vs ETFs, and the top and bottom contributing holdings with their weight at the open, weight now, price, return today, contribution (bps) and P&L. Priced from live quotes while the market is open, closing quotes after the bell until the 5:00 pm price run, and stored closes after that (then it equals get_attribution's 1d). Before the open, on weekends and holidays it returns the last session. Use it for any question about today, right now, this morning or intraday. Scope 'fund' is the whole Fund (execs and admins); 'team' is one team's sleeve.",
      inputSchema: z.object({
        scope: z.enum(["fund", "team"]).default(isFundWide(viewer) ? "fund" : "team"),
        team: z.string().optional().describe("Team slug or name for scope 'team'; defaults to this chat's team"),
        holdingsLimit: z.number().int().min(3).max(30).default(8).describe("How many top and bottom contributors to list"),
      }),
      execute: async ({ scope, team, holdingsLimit }): Promise<ToolResult<unknown>> => {
        try {
          const { sleeve, teamNames } = await resolveSleeve(scope, team, "daily performance");
          const sectors = sleeve ? (await db.select().from(teamSectors)).filter((r) => r.teamId === sleeve.id).map((r) => r.sector as GicsSector) : [];
          const snapshot = await loadLiveSnapshot(sleeve ? { team: { ...sleeve, sectors } } : {});
          if (!snapshot) return { data: { note: "No positions or closing prices are recorded yet, so there is no daily performance." }, sources: [] };
          const summary = summarizeLive(snapshot, { scope, teamName: sleeve?.name, teamSectors: sectors, teamNames, holdingsLimit });
          const path = sleeve ? `/t/${sleeve.slug}/daily` : "/daily";
          const asOf = snapshot.asOf ?? `${snapshot.session}T20:00:00.000Z`;
          const source: Source = {
            id: sourceId("daily", `${path}:${snapshot.session}:${snapshot.status}:${asOf.slice(0, 16)}`),
            title: `${sleeve ? `${sleeve.name} daily performance` : "Fund daily performance"} · ${snapshot.session} · ${snapshot.status === "final" ? "final" : `${snapshot.status}, ${summary.pricesAsOf ?? ""}`.trim()}`,
            url: appUrl(path),
            publisher: "Owl Fund daily performance (trade ledger + live quotes)",
            publishedAt: asOf,
            retrievedAt: new Date().toISOString(),
            sourceType: "Fund attribution",
            excerpt: liveHeadline(summary).slice(0, 360),
          };
          return { data: { ...summary, sourceId: source.id }, sources: [source] };
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    run_backtest: tool({
      description:
        "Hypothetical replay of the current holdings over past prices with today's weights held fixed (the current replay) and an optional modified scenario. It does not reconstruct past trades, weight changes or cash flows, so it is not realized performance; use get_attribution for how the Fund or a team actually did. The scenario may add recognized company tickers and change or drop weights with explicit offsets. Fixed weights rebalance daily using Yahoo adjusted closes. Returns performance metrics and holding contributions. This sandbox never changes the real portfolio. Execs and admins backtest the Fund; everyone else their team.",
      inputSchema: z.object({
        from: iso.optional().describe("First session; defaults to one year before `to`, like the Backtesting page"),
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
          // Same default window as the Backtesting page: a year back from the end date.
          const start = from ?? defaultWindow(end).from;
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
            .map((c) => ({ ticker: c.ticker, currentReplayContributionPct: pct(c.original), modifiedReplayContributionPct: pct(c.modified), changePct: pct(c.delta) }));
          const source: Source = {
            id: sourceId("backtest", `${snapshot.version}:${benchmark}:${r.from}:${r.to}:${JSON.stringify(addedTickers ?? [])}:${JSON.stringify(overrides ?? {})}`),
            title: `Backtest · ${snapshot.scope} · ${r.from} to ${r.to} vs ${benchmark}${changed.length ? ` · ${changed.length} weight${changed.length === 1 ? "" : "s"} changed` : ""}`,
            url: appUrl("/backtesting"),
            publisher: "Owl Fund backtest (Yahoo adjusted closes)",
            publishedAt: r.to,
            retrievedAt: new Date().toISOString(),
            sourceType: "Backtest",
            excerpt: `Hypothetical replay, not realized performance: current replay ${pct(r.original.totalReturn)}%${changed.length ? `, modified replay ${pct(r.modified.totalReturn)}%` : ""}, ${benchmark} ${pct(r.benchmarkMetrics.totalReturn)}% total return, ${r.from} to ${r.to}.`,
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
              currentReplay: metricsOut(r.original),
              ...(changed.length ? { modifiedReplay: metricsOut(r.modified) } : {}),
              benchmarkMetrics: metricsOut(r.benchmarkMetrics),
              contributions,
              ...(risk
                ? {
                    riskImpact: {
                      method: "Today's risk of the current vs modified weights with the Risk page's model (1-year window of daily returns), independent of the backtest period.",
                      current: { volatilityPct: pct(risk.before.vol), beta: +risk.before.beta.toFixed(2), trackingErrorPct: pct(risk.before.trackingError), var95Pct: pct(risk.before.var), effectivePositions: +risk.before.effectiveN.toFixed(1) },
                      modified: { volatilityPct: pct(risk.after.vol), beta: +risk.after.beta.toFixed(2), trackingErrorPct: pct(risk.after.trackingError), var95Pct: pct(risk.after.var), effectivePositions: +risk.after.effectiveN.toFixed(1) },
                      holdings: risk.holdings.map((h) => ({ ticker: h.ticker, weightPct: `${pct(h.weightBefore)} → ${pct(h.weightAfter)}`, shareOfRiskPct: `${pct(h.shareBefore)} → ${pct(h.shareAfter)}` })),
                    },
                  }
                : {}),
              method: "Hypothetical replay, not realized performance: fixed weights rebalanced daily, past trades and cash flows not reconstructed; contributions are each holding's share of the total return, in percentage points.",
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
        "Risk of the Fund's current portfolio, exactly as the Risk page computes it from the trade ledger: annualized volatility, beta to the S&P 500, tracking error vs the sector benchmark, 1-day 95% value at risk and expected shortfall (in % and dollars), a beta stress test, concentration (effective number of positions, top-5 and top-10 weight), each sector's weight vs the benchmark (active weight) and share of risk, the largest active sector bet, the holdings that contribute most risk, where the active risk comes from (each holding's and the benchmark side's share of tracking error, and marginal tracking error: how much tracking error moves for 1 pp more of a holding), highly correlated pairs, realized statistics from the Fund's own returns, and historical stress tests (today's positions held through the COVID crash, the 2022 rate shock, the SVB run and the 2024 carry unwind, vs the S&P 500 and sector benchmark, with dollar impact and worst contributors), factor and macro sensitivities (betas with t-stats to market, size, value, momentum, rates, dollar and oil for the portfolio, the benchmark and active, from the Exposure page; |t| < 2 means no clear exposure), and ETF look-through (each ETF replaced by its holdings: combined exposure per company such as 'NVDA 4.1% = 3.0% direct + 0.9% SOXX', names held both directly and via ETFs, coverage and as-of per ETF, sector weights through the ETFs, stock-level active weights vs SPY's holdings, the largest stock-level bet and Active Share). The Exposure page reads the same numbers. Use it for questions about how risky the portfolio is, what drives its risk or tracking error, active bets and exposure, concentration, diversification, beta, how much it could lose, how it would have done in a past crisis, or how sensitive it is to rates, the dollar, oil or style factors, or what the ETFs hold underneath. Scope 'fund' is the whole Fund (execs and admins); 'team' is one team's holdings as their own portfolio.",
      inputSchema: z.object({
        scope: z.enum(["fund", "team"]).default(isFundWide(viewer) ? "fund" : "team"),
        team: z.string().optional().describe("Team slug or name for scope 'team'; defaults to this chat's team"),
        lookback: z.enum(Object.keys(LOOKBACKS) as [LookbackKey, ...LookbackKey[]]).default(DEFAULT_LOOKBACK).describe("Window of daily returns: 6m, 1y or 2y"),
        holdingsLimit: z.number().int().min(3).max(30).default(10).describe("How many of the largest risk sources to list"),
        page: z.enum(["risk", "exposure"]).default("risk").describe("Which page to cite: 'exposure' when the member asked from the Exposure page; the numbers are the same"),
      }),
      execute: async ({ scope, team, lookback, holdingsLimit, page }): Promise<ToolResult<unknown>> => {
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
          const [stress, lookthrough] = await Promise.all([loadStressTests(loaded.report), loadLookthrough(loaded.report)]);
          const summary = {
            ...summarizeRisk(loaded.report, { teamNames: new Map(teamRows.map((t) => [t.id, t.name])), holdingsLimit }),
            historicalStressTests: summarizeStress(stress),
            etfLookThrough: summarizeLookthrough(lookthrough, holdingsLimit),
          };
          const path = `${sleeve ? `/t/${sleeve.slug}/${page}` : `/${page}`}?lookback=${lookback}`;
          const pageName = page === "exposure" ? "exposure" : "risk";
          const source: Source = {
            id: sourceId("risk", `${path}:${loaded.report.asOf}`),
            title: `${sleeve ? `${sleeve.name} ${pageName}` : `Fund ${pageName}`} · ${LOOKBACKS[lookback].label} window · positions at ${loaded.report.asOf} close`,
            url: appUrl(path),
            publisher: "Owl Fund risk (trade ledger, Yahoo closes)",
            publishedAt: loaded.report.asOf,
            retrievedAt: new Date().toISOString(),
            sourceType: "Fund risk",
            excerpt: `Volatility ${fmtPct(summary.annualizedVolatilityPct)} (S&P 500 ${fmtPct(summary.sp500VolatilityPct)}), beta ${fmtAccounting(summary.beta)}, tracking error ${summary.trackingErrorPct === null ? "n/a" : fmtPct(summary.trackingErrorPct)}, 1-day 95% VaR ${fmtPct(summary.var95OneDay.pct)} (${fmtUsd(summary.var95OneDay.usd, 0)}).${summary.largestActiveSectorBet ? ` Largest active sector bet ${summary.largestActiveSectorBet.sector} ${fmtBp(ppToBp(summary.largestActiveSectorBet.activePct))}.` : ""}${summary.activeRisk?.readings[0] ? ` ${summary.activeRisk.readings[0]}` : ""}${lookthrough.state === "ok" && lookthrough.report.active ? ` Active Share ${fmtPct(lookthrough.report.active.activeShare * 100, 1)} vs ${lookthrough.benchmarkLabel ?? "the benchmark"}'s holdings.` : ""}`,
          };
          return { data: { ...summary, sourceId: source.id }, sources: [source] };
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
