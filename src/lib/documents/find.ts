import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documents } from "@/db/schema";
import type { FilingDoc } from "./index";

export type FilingHit = FilingDoc & { ticker: string | null; holdingId: string | null };

/** Indexed filings by ticker, form and words in the title (the find_documents tool). */
export async function searchFilings(p: { ticker?: string; query?: string; form?: string; limit?: number }): Promise<FilingHit[]> {
  const conds = [eq(documents.kind, "filing")];
  if (p.ticker) conds.push(eq(documents.ticker, p.ticker.toUpperCase()));
  if (p.form) {
    const f = p.form.toUpperCase().replace(/\s+/g, "");
    conds.push(/^EX/.test(f) ? ilike(documents.form, "EX-99%") : or(eq(documents.form, f), eq(documents.form, `${f}/A`))!);
  }
  if (p.query) {
    const like = `%${p.query.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(documents.title, like), ilike(documents.form, like), sql`${documents.text} ilike ${like}`)!);
  }
  return db
    .select({ id: documents.id, title: documents.title, form: documents.form, url: documents.url, publishedAt: documents.publishedAt, docDate: documents.docDate, sectionNote: documents.sectionNote, embedFor: documents.embedFor, version: documents.version, textError: documents.textError, ticker: documents.ticker, holdingId: documents.holdingId })
    .from(documents)
    .where(and(...conds))
    .orderBy(desc(documents.publishedAt))
    .limit(p.limit ?? 10);
}
