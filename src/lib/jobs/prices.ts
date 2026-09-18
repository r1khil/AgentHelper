import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";
import { historyFrom, ledgerSymbols, loadLedger, syncHoldingsFromLedger } from "@/lib/attribution/store";
import { syncPrices, type SyncPricesResult } from "@/lib/prices";
import { createJobReporter } from "./progress";

export type PricesJobResult = SyncPricesResult & { status: "ok" | "skipped" | "failed"; reason?: string; holdingsSynced: number };

/**
 * Keeps closes, dividends and splits current for every ledger ticker and the benchmark ETFs,
 * then refreshes share counts and weights on holdings. Resumable: a run that hits its time
 * budget reports what is left and the next run picks it up.
 */
export async function runPricesJob(opts: { symbols?: string[]; budgetMs?: number } = {}): Promise<PricesJobResult> {
  const [jobRow] = await db.insert(jobRuns).values({ job: "prices", summary: {} }).returning({ id: jobRuns.id });
  const progress = createJobReporter(jobRow.id);
  const finish = async (r: PricesJobResult) => {
    progress.step(r.status === "failed" ? "failed" : r.status === "skipped" ? "skipped" : "finished", { updated: r.updated.length, failed: Object.keys(r.failed).length, remaining: r.remaining.length, ...(r.reason ? { reason: r.reason } : {}) });
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: r.status !== "failed", summary: r as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
    return r;
  };
  const base: PricesJobResult = { status: "ok", updated: [], failed: {}, remaining: [], holdingsSynced: 0 };
  try {
    progress.step("load ledger");
    const { inception } = await loadLedger(db);
    if (!inception) return finish({ ...base, status: "skipped", reason: "no ledger yet" });
    const symbols = opts.symbols ?? (await ledgerSymbols(db));
    progress.step("sync prices", { symbols: symbols.length, from: historyFrom(inception) });
    const synced = await syncPrices(db, {
      symbols,
      from: historyFrom(inception),
      budgetMs: opts.budgetMs,
      onProgress: (e) => progress.item("symbol", e.i, e.n, { symbol: e.symbol, ...(e.error ? { error: e.error } : { bars: e.bars }) }),
    });
    progress.step("sync holdings from ledger");
    const holdingsSynced = await syncHoldingsFromLedger(db);
    const failed = Object.keys(synced.failed).length;
    return finish({ ...base, ...synced, holdingsSynced, status: failed && !synced.updated.length ? "failed" : "ok", reason: failed ? `${failed} symbols failed` : undefined });
  } catch (e) {
    return finish({ ...base, status: "failed", reason: e instanceof Error ? e.message : String(e) });
  }
}
