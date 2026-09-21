import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, jobRuns } from "@/db/schema";
import { existingFilingIds, pruneNonTextFilings, upsertFilingDocuments } from "@/lib/documents/index";
import { listFilingDocuments, listFilings, tickerToCik } from "@/lib/providers/edgar";
import { getSetting, setSetting } from "@/lib/settings";
import { filingDocumentRows, filingExternalId, listingSince, type Exhibit } from "./filings-plan";
import { runIngest, type IngestResult } from "./ingest";
import { createJobReporter } from "./progress";

export const FILINGS_LAST_SYNC_SETTING = "filings_last_sync";

export type FilingsSyncResult = {
  status: "ok" | "skipped" | "failed";
  reason?: string;
  holdings: number;
  listed: number;
  added: number;
  /** Non-text filing rows (exhibit images) removed before listing. */
  pruned: number;
  failed: { ticker: string; error: string }[];
  ingest?: IngestResult;
  elapsedMs: number;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Index 10-K / 10-Q / 8-K (+ EX-99 press releases) for every active holding into the corpus, then run the ingest
 * job for filings within what is left of the budget. Incremental by default (since the last successful sync);
 * `backfill` lists two years of periodic reports and ninety days of 8-Ks. Never touches Drive.
 */
export async function syncFilings(opts: { backfill?: boolean; budgetMs?: number; reason?: string } = {}): Promise<FilingsSyncResult> {
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 240_000;
  const now = new Date();
  const result: FilingsSyncResult = { status: "ok", holdings: 0, listed: 0, added: 0, pruned: 0, failed: [], elapsedMs: 0 };
  const done = (r: FilingsSyncResult) => ({ ...r, elapsedMs: Date.now() - started });
  const [jobRow] = await db.insert(jobRuns).values({ job: "filings_sync", summary: { reason: opts.reason ?? "manual", backfill: Boolean(opts.backfill) } }).returning({ id: jobRuns.id });
  const progress = createJobReporter(jobRow.id);
  try {
    result.pruned = await pruneNonTextFilings();
    if (result.pruned) progress.step("pruned non-text filing rows", { pruned: result.pruned });
    const lastSync = opts.backfill ? null : await getSetting(FILINGS_LAST_SYNC_SETTING, { fresh: true });
    const window = { backfill: Boolean(opts.backfill), lastSync, now };
    const rows = await db.select({ id: holdings.id, ticker: holdings.ticker, companyName: holdings.companyName, cik: holdings.cik }).from(holdings).where(eq(holdings.status, "active"));
    result.holdings = rows.length;
    progress.step("list filings", { holdings: rows.length, since: listingSince(window) });
    for (const [i, h] of rows.entries()) {
      if (Date.now() - started > budgetMs * 0.6) {
        progress.warn("budget spent before every holding was listed", { at: i });
        break;
      }
      try {
        let cik = h.cik;
        if (!cik) {
          const r = await tickerToCik(h.ticker);
          if (!r) throw new Error("no SEC registrant for this ticker");
          cik = r.cik;
          await db.update(holdings).set({ cik }).where(and(eq(holdings.id, h.id), eq(holdings.status, "active")));
        }
        const filings = await listFilings(cik, { forms: ["10-K", "10-Q", "8-K", "10-K/A", "10-Q/A"], since: listingSince(window) });
        const known = await existingFilingIds(h.id);
        const exhibits: Record<string, Exhibit[]> = {};
        for (const f of filings) {
          if (f.form.toUpperCase() !== "8-K" || known.has(filingExternalId(f.accession, f.primaryDocument))) continue;
          exhibits[f.accession] = await listFilingDocuments(cik, f.accession).catch(() => []);
        }
        const docs = filingDocumentRows(h, filings, exhibits, window);
        result.listed += docs.length;
        result.added += await upsertFilingDocuments(docs);
        progress.item("holding", i + 1, rows.length, { ticker: h.ticker, filings: docs.length });
      } catch (e) {
        result.failed.push({ ticker: h.ticker, error: msg(e).slice(0, 200) });
        progress.item("holding", i + 1, rows.length, { ticker: h.ticker, error: msg(e).slice(0, 200) });
      }
    }
    if (!result.failed.length) await setSetting(FILINGS_LAST_SYNC_SETTING, now.toISOString().slice(0, 10), null);
    progress.step("ingest filings", { listed: result.listed, added: result.added });
    const remaining = budgetMs - (Date.now() - started);
    if (remaining > 15_000) result.ingest = await runIngest({ reason: opts.reason ?? "filings", kinds: ["filing"], budgetMs: remaining - 5_000, maxDocs: 40 });
    progress.step("finished", { listed: result.listed, added: result.added, ingest: result.ingest?.status ?? "not run" });
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...done(result), ingest: result.ingest ? { status: result.ingest.status, embedded: result.ingest.embedded, remaining: result.ingest.remaining, failed: result.ingest.failed.length } : undefined, reason: opts.reason ?? "manual" } }).where(eq(jobRuns.id, jobRow.id));
    return done(result);
  } catch (e) {
    const message = msg(e);
    progress.error("failed", { error: message });
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { ...done(result), error: message } }).where(eq(jobRuns.id, jobRow.id));
    return done({ ...result, status: "failed", reason: message });
  }
}
