import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, type DocumentRow } from "@/db/schema";
import { getFileText } from "@/lib/drive/index";
import { capText } from "@/lib/drive/text";
import { getFilingText } from "@/lib/providers/edgar";
import { filingSectionsText, usesItemSections } from "./sections";

/** Filings stored whole (8-K, exhibits) may be longer than a Drive document; the item-section form is much smaller. */
const FILING_TEXT_CHARS = 600_000;

/**
 * Text for one corpus row, fetched through the adapter for its kind and cached on the row keyed on `version`.
 * Drive rows go through getFileText (which owns the drive_files ⨝ documents read); filings come from EDGAR.
 * Throws when the source cannot be read; for filings the error is stored so the row is not retried forever.
 */
export async function getDocumentText(doc: DocumentRow): Promise<{ doc: DocumentRow; text: string }> {
  if (doc.kind === "drive") {
    const r = await getFileText(doc.id);
    return { doc: { ...doc, text: r.text, textFor: doc.version, textError: null }, text: r.text };
  }
  if (doc.textFor === doc.version && doc.text != null) return { doc, text: doc.text };
  if (doc.textFor === doc.version && doc.textError) throw new Error(doc.textError);
  if (doc.kind !== "filing" || !doc.url) throw new Error(`Documents of kind ${doc.kind} are not fetched by the app`);
  try {
    const full = await getFilingText(doc.url);
    let text: string;
    let sectionNote: string | null = null;
    const sections = usesItemSections(doc.form) ? filingSectionsText(doc.form!, full) : null;
    if (sections) {
      text = capText(sections.text, FILING_TEXT_CHARS);
      sectionNote = `Indexed sections: ${sections.found.join(", ")}. Other items: read_filing.`;
    } else {
      text = capText(full, FILING_TEXT_CHARS);
      if (usesItemSections(doc.form)) sectionNote = "No Item headings were found; the whole document is indexed.";
    }
    await db.update(documents).set({ text, textFor: doc.version, textError: null, sectionNote, updatedAt: new Date() }).where(eq(documents.id, doc.id));
    return { doc: { ...doc, text, textFor: doc.version, textError: null, sectionNote }, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // EDGAR rate limits and outages are transient: leave the row retryable rather than marking the version unreadable.
    if (!/rate limited|EDGAR 5\d\d|fetch failed|ECONN|ETIMEDOUT/i.test(message)) {
      await db.update(documents).set({ text: null, textFor: doc.version, textError: message.slice(0, 500), updatedAt: new Date() }).where(eq(documents.id, doc.id));
    }
    throw e;
  }
}
