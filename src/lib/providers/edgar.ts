import { cached } from "./cache";
import { retry, spaced } from "./limiter";
import type { Filing } from "./types";

const HOST = "sec";
const GAP_MS = 120; // 10 req/s cap; stay under it.

function ua() {
  return process.env.EDGAR_USER_AGENT || "Owl Fund Workspace admin@example.com";
}

async function secFetch(url: string, accept = "application/json") {
  return spaced(HOST, GAP_MS, () =>
    retry(async () => {
      const res = await fetch(url, { headers: { "User-Agent": ua(), Accept: accept, "Accept-Encoding": "gzip, deflate" } });
      if (res.status === 429) throw new Error("EDGAR rate limited");
      if (!res.ok) throw new Error(`EDGAR ${res.status} for ${url}`);
      return res;
    }),
  );
}

export function padCik(cik: string | number) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

type TickerMap = Record<string, { cik_str: number; ticker: string; title: string }>;

export async function tickerToCik(ticker: string): Promise<{ cik: string; name: string } | null> {
  const map = await cached<TickerMap>("edgar:tickers", 60 * 60 * 24, async () => {
    const res = await secFetch("https://www.sec.gov/files/company_tickers.json");
    return (await res.json()) as TickerMap;
  });
  const t = ticker.trim().toUpperCase().replace(".", "-");
  for (const v of Object.values(map)) {
    if (v.ticker === t) return { cik: padCik(v.cik_str), name: v.title };
  }
  return null;
}

export type Submissions = {
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  fiscalYearEnd?: string;
  sic?: string;
  sicDescription?: string;
  filings: { recent: Record<string, (string | number)[]> };
};

export async function getSubmissions(cik: string): Promise<Submissions> {
  const c = padCik(cik);
  return cached(`edgar:submissions:${c}`, 60 * 60, async () => {
    const res = await secFetch(`https://data.sec.gov/submissions/CIK${c}.json`);
    return (await res.json()) as Submissions;
  });
}

export function filingUrls(cik: string, accession: string, primaryDocument: string) {
  const c = String(Number(cik));
  const acc = accession.replace(/-/g, "");
  return {
    url: `https://www.sec.gov/Archives/edgar/data/${c}/${acc}/${primaryDocument}`,
    indexUrl: `https://www.sec.gov/Archives/edgar/data/${c}/${acc}/`,
  };
}

export async function listFilings(cik: string, opts: { forms?: string[]; limit?: number; since?: string } = {}): Promise<Filing[]> {
  const sub = await getSubmissions(cik);
  const r = sub.filings.recent;
  const n = r.accessionNumber?.length ?? 0;
  const out: Filing[] = [];
  const forms = opts.forms?.map((f) => f.toUpperCase());
  for (let i = 0; i < n; i++) {
    const form = String(r.form[i]);
    if (forms && !forms.includes(form.toUpperCase())) continue;
    const filedAt = String(r.filingDate[i]);
    if (opts.since && filedAt < opts.since) continue;
    const accession = String(r.accessionNumber[i]);
    const primaryDocument = String(r.primaryDocument[i]);
    out.push({
      accession,
      form,
      filedAt,
      items: r.items?.[i] ? String(r.items[i]) : undefined,
      reportDate: r.reportDate?.[i] ? String(r.reportDate[i]) : undefined,
      description: r.primaryDocDescription?.[i] ? String(r.primaryDocDescription[i]) : undefined,
      primaryDocument,
      ...filingUrls(cik, accession, primaryDocument),
    });
    if (opts.limit && out.length >= opts.limit) break;
  }
  return out;
}

/** Strip an EDGAR HTML document to readable text, keeping paragraph breaks. */
export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Inline-XBRL metadata (contexts, units, hidden facts) is not readable text.
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, "")
    .replace(/<ix:hidden[\s\S]*?<\/ix:hidden>/gi, "")
    .replace(/<div[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function getFilingText(url: string): Promise<string> {
  // v2: inline-XBRL metadata is stripped; older cached conversions still contain it.
  return cached(`edgar:doc:v2:${url}`, 60 * 60 * 24 * 7, async () => {
    const res = await secFetch(url, "text/html,application/xhtml+xml,text/plain");
    const body = await res.text();
    return url.endsWith(".txt") ? body : htmlToText(body);
  });
}

/** List documents inside a filing, with EDGAR's exhibit types (EX-99.1 etc.) parsed from the filing index page. */
export async function listFilingDocuments(cik: string, accession: string): Promise<{ name: string; url: string; type?: string; description?: string }[]> {
  const c = String(Number(cik));
  const acc = accession.replace(/-/g, "");
  const dashed = accession.includes("-") ? accession : `${accession.slice(0, 10)}-${accession.slice(10, 12)}-${accession.slice(12)}`;
  const indexHtm = `https://www.sec.gov/Archives/edgar/data/${c}/${acc}/${dashed}-index.htm`;
  const key = `edgar:index-htm:${c}:${acc}`;
  return cached(key, 60 * 60 * 24 * 30, async () => {
    const res = await secFetch(indexHtm, "text/html");
    const html = await res.text();
    const out: { name: string; url: string; type?: string; description?: string }[] = [];
    // Rows of the "Document Format Files" table: Seq | Description | Document (link) | Type | Size
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (cells.length < 4) continue;
      const link = cells[2].match(/href="([^"]+)"/i)?.[1];
      if (!link) continue;
      const name = link.split("/").pop()!.replace(/\?.*$/, "");
      const strip = (x: string) => x.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
      out.push({ name, url: `https://www.sec.gov/Archives/edgar/data/${c}/${acc}/${name}`, type: strip(cells[3]) || undefined, description: strip(cells[1]) || undefined });
    }
    return out;
  });
}

const ITEM_HEADING_RE = /(^|\n|\t)\s*item\s+(\d+[a-c]?(?:\.\d+)?)[\s.:\-–—]/gi;

/** Shorter than this, a match is a table-of-contents line, not the section. */
const MIN_SECTION_CHARS = 120;

/**
 * Extract a whole section by "Item X" heading from 10-K/10-Q text.
 * Headings may sit inside a table cell (tab-separated after htmlToText), so tabs count as line starts.
 * The same item number can appear several times (table of contents, Part I and Part II of a 10-Q);
 * the longest candidate wins, which is the body section rather than a contents entry or the short
 * Part II housekeeping item. The caller windows the result; this returns the full section so paging
 * can be reported honestly.
 */
export function extractItem(text: string, item: string, maxChars?: number) {
  const re = new RegExp(`(^|\\n|\\t)\\s*item\\s+${item.replace(".", "\\.")}(?![\\dA-Ca-c])(?!\\.\\d)[\\s.:\\-–—]`, "gi");
  let best: string | null = null;
  for (const m of text.matchAll(re)) {
    const rest = text.slice(m.index ?? 0);
    const nextItem = rest.slice(20).search(/(\n|\t)\s*item\s+\d+[a-c]?(?:\.\d+)?[\s.:\-–—]/i);
    const chunk = nextItem > 0 ? rest.slice(0, nextItem + 20) : rest;
    if (!best || chunk.length > best.length) best = chunk;
  }
  // The longest match is the section itself; table-of-contents lines are a few dozen characters. Some real sections
  // are short (a 10-K's Item 2 Properties, Item 4 Mine Safety), so anything past a contents line counts.
  if (!best || best.trim().length < MIN_SECTION_CHARS) return null;
  return maxChars ? best.slice(0, maxChars) : best;
}

/** Distinct "Item X" headings present in a filing, in document order (table of contents included). */
export function listItemHeadings(text: string) {
  const seen = new Set<string>();
  for (const m of text.matchAll(ITEM_HEADING_RE)) seen.add(m[2].toUpperCase());
  return [...seen];
}

// ---- XBRL company facts ----

export type Fact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
};

export type CompanyFacts = {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { label: string; description: string; units: Record<string, Fact[]> }>>;
};

export async function getCompanyFacts(cik: string): Promise<CompanyFacts> {
  const c = padCik(cik);
  return cached(`edgar:facts:${c}`, 60 * 60 * 24, async () => {
    const res = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${c}.json`);
    return (await res.json()) as CompanyFacts;
  });
}

export function listConcepts(facts: CompanyFacts, taxonomy = "us-gaap") {
  const t = facts.facts[taxonomy] ?? {};
  return Object.entries(t).map(([concept, v]) => ({
    concept,
    label: v.label,
    description: v.description,
    units: Object.keys(v.units),
    count: Object.values(v.units).reduce((n, arr) => n + arr.length, 0),
  }));
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export type PeriodFact = Fact & { periodKind: "instant" | "quarter" | "ytd" | "annual" | "other" };

export function classifyFact(f: Fact): PeriodFact["periodKind"] {
  if (!f.start) return "instant";
  const d = daysBetween(f.start, f.end);
  if (d >= 80 && d <= 100) return "quarter";
  if (d >= 350 && d <= 380) return "annual";
  if (d >= 170 && d <= 290) return "ytd";
  return "other";
}

/** All facts for a concept/unit, de-duplicated to the latest filing per (start,end). */
export function conceptFacts(facts: CompanyFacts, concept: string, unit: string, taxonomy = "us-gaap"): PeriodFact[] {
  const arr = facts.facts[taxonomy]?.[concept]?.units?.[unit] ?? [];
  const byPeriod = new Map<string, Fact[]>();
  for (const f of arr) {
    const k = `${f.start ?? ""}|${f.end}`;
    byPeriod.set(k, [...(byPeriod.get(k) ?? []), f]);
  }
  const out: PeriodFact[] = [];
  for (const group of byPeriod.values()) {
    group.sort((a, b) => (a.filed < b.filed ? 1 : -1));
    out.push({ ...group[0], periodKind: classifyFact(group[0]) });
  }
  return out.sort((a, b) => (a.end < b.end ? -1 : 1));
}

/** Detect restatement: multiple distinct values for the same period across filings. */
export function restatedValues(facts: CompanyFacts, concept: string, unit: string, start: string | undefined, end: string, taxonomy = "us-gaap") {
  const arr = facts.facts[taxonomy]?.[concept]?.units?.[unit] ?? [];
  const same = arr.filter((f) => (f.start ?? "") === (start ?? "") && f.end === end);
  const vals = new Set(same.map((f) => f.val));
  return vals.size > 1 ? same.sort((a, b) => (a.filed < b.filed ? 1 : -1)) : null;
}

export function filingUrlForFact(cik: string, f: Fact) {
  const c = String(Number(cik));
  const acc = f.accn.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${c}/${acc}/`;
}
