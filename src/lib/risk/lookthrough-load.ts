import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { BENCHMARK_REFERENCE, ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { constituentsTableExists, isKnownEtf, loadEtfConstituents } from "@/lib/lookthrough/store";
import { lookthroughFromRisk, type LookthroughState } from "./lookthrough-report";
import type { RiskReport } from "./model";

/**
 * Per request: the ETF look-through for a Risk report (Fund or team), from the lists the price job stores weekly.
 * Positions don't depend on the lookback, so any report for the scope gives the same result.
 */
export const loadLookthrough = cache(async (report: RiskReport): Promise<LookthroughState> => {
  const started = Date.now();
  const heldEtfs = report.holdings.map((h) => h.ticker.toUpperCase()).filter(isKnownEtf);
  if (!(await constituentsTableExists(db))) return { state: "unavailable", reason: "no-table", heldEtfs };
  const lists = await loadEtfConstituents(db, [...heldEtfs, BENCHMARK_REFERENCE, ...Object.values(ETF_BY_SECTOR)]);
  if (!lists.length) return { state: "unavailable", reason: "no-lists", heldEtfs };
  const state = lookthroughFromRisk(report, lists, { isEtf: isKnownEtf });
  console.log(`[risk] look-through ${report.scope} ${heldEtfs.length} ETFs, ${lists.length} lists in ${Date.now() - started}ms`);
  return state;
});
