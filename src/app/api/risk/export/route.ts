import { canManageTeam, getCurrentUser, isFundWide } from "@/lib/auth";
import { activeRiskBreakdown } from "@/lib/risk/active";
import { buildExposure } from "@/lib/risk/exposure";
import { loadRisk } from "@/lib/risk/load";
import { parseLookback, type RiskReport } from "@/lib/risk/model";
import { getTeamBySlug } from "@/lib/teams";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Number(v.toPrecision(12))) : "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

/**
 * One CSV per `file` name. Every builder reads the same risk report the pages render, so each downloaded number
 * matches the page exactly. New sections add their own entry here.
 */
const BUILDERS = {
  // Exactly the columns the statistics used: gaps already filled as described in the coverage table.
  returns: (r: RiskReport) => {
    const m = r.matrix;
    return csv([["date", ...m.tickers], ...m.dates.map((d, t) => [d, ...m.columns.map((c) => c[t])])]);
  },
  covariance: (r: RiskReport) => {
    const m = r.matrix;
    return csv([["", ...m.tickers], ...m.covariance.map((row, i) => [m.tickers[i], ...row])]);
  },
  positions: (r: RiskReport) => {
    const m = r.matrix;
    const byTicker = new Map(r.holdings.map((h) => [h.ticker, h]));
    const legs = new Map(r.benchmarkLegs.map((l) => [l.etf, l]));
    const coverage = new Map(r.coverage.map((c) => [c.ticker, c]));
    return csv([
      ["symbol", "name", "sector", "value_usd", "weight", "active_weight", "source", "proxy", "own_returns", "filled_days", "volatility_ann", "beta", "corr_to_portfolio", "risk_share", "active_risk_share", "te_contribution_ann", "marginal_te_ann"],
      ...m.tickers.map((t, i) => {
        // Holdings come first in the matrix; a held sector ETF's benchmark leg is its later column.
        const h = i < r.holdings.length ? byTicker.get(t) : undefined;
        const leg = h ? undefined : legs.get(t);
        const c = coverage.get(t);
        return [t, h?.name ?? "", h?.sector ?? leg?.sector ?? "", h?.value ?? 0, m.weights[i], m.active?.[i] ?? "", c?.source, c?.proxy ?? "", c?.observations, c?.filled, h?.vol, h?.beta, h?.corrToPortfolio, h?.riskShare, h?.activeRiskShare ?? leg?.activeRiskShare, h?.teContribution ?? leg?.teContribution, h?.marginalTe ?? leg?.marginalTe];
      }),
      ["CASH", "Cash", "", r.cash.value, r.cash.weight, r.cash.weight, "riskless", "", "", "", 0, 0, "", 0, 0, 0, 0],
    ]);
  },
  // The Risk page's "Where the active risk comes from" table: holdings, then the benchmark side, adding to 100%.
  "active-risk": (r: RiskReport) => {
    const a = activeRiskBreakdown(r);
    if (!a) return csv([["note"], ["No benchmark sector weights are saved, so tracking error cannot be split."]]);
    return csv([
      ["row", "symbol", "name", "sector", "weight", "active_risk_share", "te_contribution_ann", "marginal_te_pp_per_1pp", "tracking_error_ann"],
      ...a.holdings.map((h) => ["holding", h.ticker, h.name, h.sector ?? "", h.weight, h.share, h.teContribution, h.marginalTe, a.trackingError]),
      ...a.benchmark.legs.map((l) => ["benchmark", l.etf, l.label, l.sector, l.weight, l.activeRiskShare, l.teContribution, l.marginalTe, a.trackingError]),
      ["total", "", "", "", "", a.total, a.holdings.reduce((s, h) => s + h.teContribution, 0) + a.benchmark.teContribution, "", a.trackingError],
    ]);
  },
  // The Exposure page: its sector table (sorted by active weight) and headline numbers.
  exposure: (r: RiskReport) => {
    const x = buildExposure(r);
    return csv([
      ["row", "key", "label", "etf", "weight", "benchmark_weight", "active_weight", "risk_share", "active_risk_share", "holdings"],
      ...x.sectors.map((s) => ["sector", s.key, s.label, s.etf ?? "", s.weight, s.benchWeight, s.active, s.riskShare, s.activeRiskShare, s.tickers.join(" ")]),
      ["total", "", "Overweights", "", "", "", x.overweight, "", "", ""],
      ["total", "", "Underweights", "", "", "", x.underweight, "", "", ""],
      ...x.top.holdings.map((h, i) => [`top_${i + 1}`, h.ticker, h.name, "", h.weight, "", "", "", "", ""]),
      ["total", "", `Top ${x.top.holdings.length} weight`, "", x.top.weight, "", "", "", "", ""],
      ["total", "", "Effective positions", "", x.effectiveN, "", "", "", "", `of ${x.holdingsCount}`],
      ["total", "", "Cash", "", x.cash.weight, "", "", "", "", ""],
    ]);
  },
} satisfies Record<string, (r: RiskReport) => string>;
type File = keyof typeof BUILDERS;
const isFile = (f: string | null): f is File => !!f && Object.hasOwn(BUILDERS, f);

/** The inputs behind the Risk and Exposure pages as CSV, so any number on them can be reproduced in a spreadsheet. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  if (!isFile(file)) return new Response("Unknown file", { status: 400 });
  const lookback = parseLookback(url.searchParams.get("lookback") ?? undefined);
  const slug = url.searchParams.get("team");

  let teamId: string | null = null;
  if (slug) {
    const team = await getTeamBySlug(slug);
    if (!team || !canManageTeam(user, team.id)) return new Response("Not found", { status: 404 });
    teamId = team.id;
  } else if (!isFundWide(user)) {
    return new Response("Not found", { status: 404 });
  }

  const loaded = await loadRisk(lookback, teamId);
  if (loaded.state !== "ok") return new Response("No risk data yet", { status: 404 });
  const name = `owl-fund-risk-${slug ?? "fund"}-${lookback}-${file}-${loaded.report.asOf}.csv`;
  return new Response(BUILDERS[file](loaded.report), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
