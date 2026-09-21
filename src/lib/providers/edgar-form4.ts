import { cached } from "./cache";
import { listFilingDocuments, listFilings } from "./edgar";
import { retry, spaced } from "./limiter";

const HOST = "sec";
const GAP_MS = 120;

export type InsiderTransaction = {
  owner: string;
  relationship: string | null;
  date: string;
  /** SEC transaction code: P purchase, S sale, A grant/award, M option exercise, F tax withholding, G gift. */
  code: string;
  acquiredDisposed: "A" | "D" | null;
  shares: number | null;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
  security: string | null;
};

export type InsiderFiling = { accession: string; filedAt: string; url: string; transactions: InsiderTransaction[]; parseError?: string };

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${name}>`, "i"))?.[1]?.trim() ?? null;
const num = (v: string | null) => (v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export const TRANSACTION_CODES: Record<string, string> = { P: "Open-market purchase", S: "Open-market sale", A: "Grant or award", M: "Option exercise", F: "Tax withholding", G: "Gift", D: "Disposition to issuer", C: "Conversion", J: "Other" };

/** Parse the non-derivative transactions out of an EDGAR ownership XML document (Form 4 / 4/A). */
export function parseForm4Xml(xml: string): InsiderTransaction[] {
  const ownerBlock = xml.match(/<reportingOwner>[\s\S]*?<\/reportingOwner>/i)?.[0] ?? "";
  const owner = tag(ownerBlock, "rptOwnerName") ?? "Unknown reporting owner";
  const rel = ownerBlock.match(/<reportingOwnerRelationship>[\s\S]*?<\/reportingOwnerRelationship>/i)?.[0] ?? "";
  const roles = [tag(rel, "officerTitle"), tag(rel, "isDirector") === "1" || /<isDirector>\s*true/i.test(rel) ? "Director" : null, tag(rel, "isTenPercentOwner") === "1" || /<isTenPercentOwner>\s*true/i.test(rel) ? "10% owner" : null].filter(Boolean);
  const relationship = roles.length ? roles.join(", ") : null;
  const out: InsiderTransaction[] = [];
  for (const m of xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)) {
    const t = m[1];
    const date = tag(t, "transactionDate");
    if (!date) continue;
    const ad = tag(t, "transactionAcquiredDisposedCode");
    out.push({
      owner,
      relationship,
      date,
      code: tag(t, "transactionCode") ?? "?",
      acquiredDisposed: ad === "A" || ad === "D" ? ad : null,
      shares: num(tag(t, "transactionShares")),
      pricePerShare: num(tag(t, "transactionPricePerShare")),
      sharesOwnedAfter: num(tag(t, "sharesOwnedFollowingTransaction")),
      security: tag(t, "securityTitle"),
    });
  }
  return out;
}

async function fetchXml(url: string): Promise<string> {
  return cached(`edgar:form4:${url}`, 60 * 60 * 24 * 30, async () => {
    const res = await spaced(HOST, GAP_MS, () =>
      retry(async () => {
        const r = await fetch(url, { headers: { "User-Agent": process.env.EDGAR_USER_AGENT || "Owl Fund Workspace admin@example.com", Accept: "application/xml,text/xml,*/*" } });
        if (r.status === 429) throw new Error("EDGAR rate limited");
        if (!r.ok) throw new Error(`EDGAR ${r.status} for ${url}`);
        return r;
      }),
    );
    return res.text();
  });
}

/** The raw ownership XML for a Form 4 filing: the primary document with any XSL rendering path removed, else the first .xml in the index. */
export async function form4XmlUrl(cik: string, filing: { accession: string; url: string; primaryDocument: string }): Promise<string | null> {
  const stripped = filing.url.replace(/\/xsl[^/]+\//i, "/");
  if (/\.xml$/i.test(stripped)) return stripped;
  const docs = await listFilingDocuments(cik, filing.accession).catch(() => []);
  return docs.find((d) => /\.xml$/i.test(d.name) && !/index/i.test(d.name))?.url ?? null;
}

/** Recent Form 4 filings for a company with their parsed transactions, newest first. */
export async function getInsiderTransactions(cik: string, limit = 10): Promise<InsiderFiling[]> {
  const filings = await listFilings(cik, { forms: ["4", "4/A"], limit });
  const out: InsiderFiling[] = [];
  for (const f of filings) {
    const xmlUrl = await form4XmlUrl(cik, f);
    if (!xmlUrl) {
      out.push({ accession: f.accession, filedAt: f.filedAt, url: f.url, transactions: [], parseError: "No XML document found in the filing" });
      continue;
    }
    try {
      out.push({ accession: f.accession, filedAt: f.filedAt, url: f.url, transactions: parseForm4Xml(await fetchXml(xmlUrl)) });
    } catch (e) {
      out.push({ accession: f.accession, filedAt: f.filedAt, url: f.url, transactions: [], parseError: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
