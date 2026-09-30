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

/**
 * The text of the first <name> element, or of its <value> child. A value followed by a footnote reference
 * (`<value>61.20</value><footnoteId id="F1"/>`, common on weighted-average prices) still reads.
 */
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  const v = m[1].match(/<value>([\s\S]*?)<\/value>/i);
  return (v ? v[1] : m[1].replace(/<[^>]+>/g, "")).trim();
};
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

const flag = (xml: string, name: string) => {
  const v = tag(xml, name);
  return v === "1" || v?.toLowerCase() === "true";
};

/** Filing-level facts of a Form 4 the transaction rows don't carry: the reporting owner's roles and the 10b5-1 box. */
export type Form4Meta = {
  isOfficer: boolean;
  isDirector: boolean;
  officerTitle: string | null;
  /**
   * The "made pursuant to a contract, instruction or written plan intended to satisfy Rule 10b5-1(c)" box, on Form 4s
   * filed since April 2023. Older filings only say so in a footnote, which is read as a fallback.
   */
  aff10b5One: boolean;
};

export function parseForm4Meta(xml: string): Form4Meta {
  const rel = xml.match(/<reportingOwnerRelationship>[\s\S]*?<\/reportingOwnerRelationship>/i)?.[0] ?? "";
  const footnotes = [...xml.matchAll(/<footnote\b[^>]*>([\s\S]*?)<\/footnote>/gi)].map((m) => m[1]).join(" ");
  // A footnote naming Rule 10b5-1, unless it says the sale was not under such a plan. It can't tell which rows of a
  // multi-row filing it covers, so it applies to the filing.
  const planFootnote = /10b5-1/i.test(footnotes) && !/\bnot\b[^.]{0,60}10b5-1/i.test(footnotes);
  return {
    isOfficer: flag(rel, "isOfficer") || Boolean(tag(rel, "officerTitle")),
    isDirector: flag(rel, "isDirector"),
    officerTitle: tag(rel, "officerTitle"),
    aff10b5One: flag(xml, "aff10b5One") || planFootnote,
  };
}

export type InsiderFilingWithMeta = InsiderFiling & Partial<Form4Meta>;

/**
 * Every Form 4 filed since a date (not just the latest ten), with the owner's roles and the 10b5-1 flag. `maxFilings`
 * bounds the work for a company with heavy insider activity; the result says how many were left out.
 */
export async function getInsiderFilingsSince(cik: string, since: string, maxFilings = 120): Promise<{ filings: InsiderFilingWithMeta[]; skipped: number }> {
  const all = await listFilings(cik, { forms: ["4", "4/A"], since });
  const filings: InsiderFilingWithMeta[] = [];
  for (const f of all.slice(0, maxFilings)) {
    const xmlUrl = await form4XmlUrl(cik, f);
    if (!xmlUrl) {
      filings.push({ accession: f.accession, filedAt: f.filedAt, url: f.url, transactions: [], parseError: "No XML document found in the filing" });
      continue;
    }
    try {
      const xml = await fetchXml(xmlUrl);
      filings.push({ accession: f.accession, filedAt: f.filedAt, url: f.url, transactions: parseForm4Xml(xml), ...parseForm4Meta(xml) });
    } catch (e) {
      filings.push({ accession: f.accession, filedAt: f.filedAt, url: f.url, transactions: [], parseError: e instanceof Error ? e.message : String(e) });
    }
  }
  return { filings, skipped: Math.max(0, all.length - maxFilings) };
}

/**
 * Officers' net open-market selling since a date, leaving out sales under a 10b5-1 plan: open-market sales (code S)
 * less open-market purchases (code P), in dollars and shares. Directors who are not officers, and 10% owners, don't
 * count. Filings that failed to parse are counted so a caller can say the figure is incomplete.
 */
export function netOfficerSales(filings: InsiderFilingWithMeta[], since: string): { soldUsd: number; boughtUsd: number; netUsd: number; netShares: number; planSalesExcluded: number; officers: string[]; unparsed: number } {
  let soldUsd = 0;
  let boughtUsd = 0;
  let netShares = 0;
  let planSalesExcluded = 0;
  let unparsed = 0;
  const officers = new Set<string>();
  for (const f of filings) {
    if (f.parseError) unparsed++;
    if (!f.isOfficer) continue;
    for (const t of f.transactions) {
      if (t.date < since || (t.code !== "S" && t.code !== "P")) continue;
      const shares = t.shares ?? 0;
      const usd = shares * (t.pricePerShare ?? 0);
      if (t.code === "S") {
        if (f.aff10b5One) {
          planSalesExcluded++;
          continue;
        }
        soldUsd += usd;
        netShares += shares;
      } else {
        boughtUsd += usd;
        netShares -= shares;
      }
      officers.add(t.owner);
    }
  }
  return { soldUsd, boughtUsd, netUsd: soldUsd - boughtUsd, netShares, planSalesExcluded, officers: [...officers], unparsed };
}
