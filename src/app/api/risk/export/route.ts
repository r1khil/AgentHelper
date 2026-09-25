import { canManageTeam, getCurrentUser, isFundWide } from "@/lib/auth";
import { loadRisk } from "@/lib/risk/load";
import { parseLookback, type RiskReport } from "@/lib/risk/model";
import { getTeamBySlug } from "@/lib/teams";

export const dynamic = "force-dynamic";

const FILES = ["returns", "covariance", "positions"] as const;
type File = (typeof FILES)[number];

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Number(v.toPrecision(12))) : "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

function build(file: File, r: RiskReport): string {
  const m = r.matrix;
  if (file === "returns") {
    // Exactly the columns the statistics used: gaps already filled as described in the coverage table.
    return csv([["date", ...m.tickers], ...m.dates.map((d, t) => [d, ...m.columns.map((c) => c[t])])]);
  }
  if (file === "covariance") return csv([["", ...m.tickers], ...m.covariance.map((row, i) => [m.tickers[i], ...row])]);
  const byTicker = new Map(r.holdings.map((h) => [h.ticker, h]));
  const coverage = new Map(r.coverage.map((c) => [c.ticker, c]));
  return csv([
    ["symbol", "name", "sector", "value_usd", "weight", "active_weight", "source", "proxy", "own_returns", "filled_days", "volatility_ann", "beta", "corr_to_portfolio", "risk_share", "active_risk_share"],
    ...m.tickers.map((t, i) => {
      const h = byTicker.get(t);
      const c = coverage.get(t);
      return [t, h?.name ?? "", h?.sector ?? "", h?.value ?? 0, m.weights[i], m.active?.[i] ?? "", c?.source, c?.proxy ?? "", c?.observations, c?.filled, h?.vol, h?.beta, h?.corrToPortfolio, h?.riskShare, h?.activeRiskShare];
    }),
    ["CASH", "Cash", "", r.cash.value, r.cash.weight, r.cash.weight, "riskless", "", "", "", 0, 0, "", 0, 0],
  ]);
}

/** The inputs behind the Risk page as CSV, so any number on it can be reproduced in a spreadsheet. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const file = url.searchParams.get("file") as File;
  if (!FILES.includes(file)) return new Response("Unknown file", { status: 400 });
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
  return new Response(build(file, loaded.report), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
