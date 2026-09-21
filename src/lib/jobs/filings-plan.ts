/** Pure helpers for the filings sync: which filings to list and how they map onto corpus rows. */
import { randomUUID } from "node:crypto";
import type { DocumentInsert } from "@/db/schema";
import type { Filing } from "@/lib/providers/types";

export const FILING_FORMS = ["10-K", "10-Q", "8-K"] as const;
export const FILING_PUBLISHER = "SEC EDGAR";

/** Backfill windows: two years of periodic reports, ninety days of 8-Ks. */
export const BACKFILL_DAYS: Record<string, number> = { "10-K": 730, "10-Q": 730, "8-K": 90 };

export type Exhibit = { name: string; url: string; type?: string; description?: string };
export type HoldingRef = { id: string; ticker: string; companyName: string };

const isoDaysAgo = (days: number, now: Date) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

/** Earliest filing date to list per form. `lastSync` (yyyy-mm-dd) narrows an incremental run with one day of overlap. */
export function sinceFor(form: string, opts: { backfill: boolean; lastSync: string | null; now: Date }): string {
  const floor = isoDaysAgo(BACKFILL_DAYS[form] ?? 90, opts.now);
  if (opts.backfill || !opts.lastSync) return floor;
  const overlap = new Date(Date.parse(`${opts.lastSync}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return overlap > floor ? overlap : floor;
}

/** The earliest of all per-form windows, so one EDGAR listing call covers every form. */
export function listingSince(opts: { backfill: boolean; lastSync: string | null; now: Date }): string {
  return FILING_FORMS.map((f) => sinceFor(f, opts)).sort()[0];
}

export const filingExternalId = (accession: string, documentName: string) => `${accession}/${documentName}`;

export function isEarningsExhibit(e: Exhibit): boolean {
  return /EX-?99/i.test(e.type ?? "") || /ex-?99/i.test(e.name);
}

const dateAt = (d: string) => new Date(`${d}T12:00:00Z`);

/**
 * Corpus rows for a holding's filings: the primary document of every listed filing, plus the EX-99 exhibits given
 * for 8-Ks (press releases). Filings before their form's `since` are dropped; ids are fresh UUIDs (the upsert keys
 * on external_id, so existing rows keep theirs).
 */
export function filingDocumentRows(h: HoldingRef, filings: Filing[], exhibits: Record<string, Exhibit[]>, opts: { backfill: boolean; lastSync: string | null; now: Date }): DocumentInsert[] {
  const out: DocumentInsert[] = [];
  for (const f of filings) {
    const form = f.form.toUpperCase();
    const base = form.replace(/\/A$/, "");
    if (!(FILING_FORMS as readonly string[]).includes(base)) continue;
    if (f.filedAt < sinceFor(base, opts)) continue;
    const common = { kind: "filing" as const, holdingId: h.id, ticker: h.ticker, publisher: FILING_PUBLISHER, publishedAt: dateAt(f.filedAt), docDate: f.reportDate ?? null, version: f.accession };
    out.push({ ...common, id: randomUUID(), externalId: filingExternalId(f.accession, f.primaryDocument), title: `${h.companyName} ${form} filed ${f.filedAt}`, url: f.url, form });
    if (base !== "8-K") continue;
    for (const e of (exhibits[f.accession] ?? []).filter(isEarningsExhibit)) {
      const type = (e.type ?? "EX-99.1").toUpperCase();
      out.push({ ...common, id: randomUUID(), externalId: filingExternalId(f.accession, e.name), title: `${h.companyName} ${type}${e.description ? ` (${e.description})` : ""} filed ${f.filedAt}`, url: e.url, form: type });
    }
  }
  return out;
}
