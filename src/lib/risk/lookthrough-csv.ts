import { SOURCE_LABELS } from "@/lib/lookthrough/parse";
import type { LookthroughState } from "./lookthrough-report";
import type { RiskReport } from "./model";

/**
 * Rows for the Exposure page's look-through CSV. Every number the section shows can be rebuilt from it:
 * company rows (direct + through each ETF) plus the not-looked-through and cash rows add to 100%; `benchmark_weight`
 * on the company rows (benchmark-only companies included) reproduces Active Share with =SUMPRODUCT(ABS(...)).
 */
export function lookthroughCsvRows(r: RiskReport, state: LookthroughState): unknown[][] {
  if (state.state !== "ok") {
    return [["note"], [state.reason === "no-table" ? "ETF holdings are not set up yet (migration 0021)." : "No ETF holdings lists are stored yet."]];
  }
  const lt = state.report;
  const head = ["row", "key", "name", "sector", "weight", "direct_weight", "through_etfs", "benchmark_weight", "active_weight", "as_held_weight", "assumed_weight", "coverage", "as_of", "source", "note"];
  const rows: unknown[][] = [head];
  const blank = (n: number) => Array.from({ length: n }, () => "");
  const bench = new Map((lt.active?.rows ?? []).map((a) => [a.key, a]));

  for (const n of lt.names) {
    const a = bench.get(n.key);
    rows.push(["company", n.key, n.name, n.sector ?? "", n.total, n.direct, n.viaEtfs.map((v) => `${v.via}:${v.weight}`).join(" "), a?.benchmark ?? (lt.active ? 0 : ""), a?.active ?? "", "", "", "", "", "", [n.overlap ? "held directly and through ETFs" : "", n.symbols.length > 1 ? `share classes ${n.symbols.join("+")}` : ""].filter(Boolean).join("; ")]);
  }
  const held = new Set(lt.names.map((n) => n.key));
  for (const a of lt.active?.rows ?? []) {
    if (!held.has(a.key)) rows.push(["company", a.key, a.name, "", 0, 0, "", a.benchmark, a.active, "", "", "", "", "", "benchmark only"]);
  }
  for (const l of lt.notLookedThrough.byEtf) rows.push(["not looked through", l.via, "", "", l.weight, ...blank(10)]);
  rows.push(["cash", "CASH", "Cash", "", lt.cash, ...blank(10)]);
  rows.push(["total", "", "Companies + not looked through + cash", "", lt.total, ...blank(10)]);

  for (const e of lt.etfs) {
    rows.push(["etf", e.etf, "", "", e.weight, "", "", "", "", "", "", e.coverage, e.asOf ?? "", e.source ? SOURCE_LABELS[e.source] : "", [e.status, state.stale.includes(e.etf) ? "stale" : "", `${e.names} names`].filter(Boolean).join("; ")]);
  }
  const benchBySector = new Map(r.sectors.map((s) => [s.key, s.benchWeight]));
  for (const s of lt.sectors) {
    const b = benchBySector.get(s.key);
    rows.push(["sector through ETFs", s.key, s.label, "", s.lookthrough, "", "", b ?? "", b === null || b === undefined ? "" : s.lookthrough - b, s.asHeld, s.assumed, "", "", "", ""]);
  }
  if (lt.active) {
    const a = lt.active;
    rows.push(["active share", state.benchmarkLabel ?? a.benchmark.etf, "½ × Σ|w_p − w_b|, each side scaled to 100%", "", a.activeShare, "", "", "", "", "", "", a.benchmark.coverage, a.benchmark.asOf, SOURCE_LABELS[a.benchmark.source], `left out (cash and not looked through): ${a.excluded}`]);
    if (a.largestBet) rows.push(["largest active bet", a.largestBet.key, a.largestBet.name, "", a.largestBet.fund, "", "", a.largestBet.benchmark, a.largestBet.active, "", "", "", "", "", ""]);
  } else if (state.benchmarkMissing) {
    rows.push(["active share", state.benchmarkLabel ?? "", "", "", "", "", "", "", "", "", "", "", "", "", state.benchmarkMissing]);
  }
  return rows;
}
