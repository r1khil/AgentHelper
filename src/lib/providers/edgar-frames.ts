import { cached } from "./cache";
import { padCik } from "./edgar";
import { retry, spaced } from "./limiter";

/*
 * SEC's XBRL frames API: one concept, one unit, one calendar period, every filer at once. The screen reads the whole
 * market this way in a few hundred requests instead of one company-facts file per company.
 *
 * A frame is a calendar period ("CY2025" for a year, "CY2025Q4I" for an instant near a quarter end). SEC places each
 * filer's annual figure in the calendar year it most overlaps, so a fiscal year ending in June 2025 sits in CY2025
 * beside a December 2025 year; every row carries its own period end. Frames hold the latest filed value for each
 * period, restatements included, and only facts without dimensions (a per-share-class figure is not in them).
 *
 * Frames responses are several megabytes and never go through provider_cache: callers keep only what they need.
 */

const HOST = "sec"; // Shares the per-process SEC queue with edgar.ts and edgar-form4.ts.
const GAP_MS = 120;

function ua() {
  return process.env.EDGAR_USER_AGENT || "Owl Fund Workspace admin@example.com";
}

/** GET a SEC JSON document through the shared limiter. A 404 returns null (no filer reported that concept then). */
async function secJson<T>(url: string): Promise<T | null> {
  return spaced(HOST, GAP_MS, () =>
    retry(async () => {
      const res = await fetch(url, { headers: { "User-Agent": ua(), Accept: "application/json", "Accept-Encoding": "gzip, deflate" } });
      if (res.status === 404) return null;
      if (res.status === 429) throw new Error("EDGAR rate limited");
      if (!res.ok) throw new Error(`EDGAR ${res.status} for ${url}`);
      return (await res.json()) as T;
    }),
  );
}

export type FrameTaxonomy = "us-gaap" | "dei";

/** One frames call: a concept in a unit for a calendar period ("CY2025", "CY2025Q4I"). */
export type FrameRequest = { taxonomy: FrameTaxonomy; concept: string; unit: string; period: string };

/** One filer's value in a frame. `start` is present for durations only. */
export type FrameRow = { cik: number; val: number; end: string; start?: string; accn: string };

type FrameResponse = { taxonomy: string; tag: string; ccp: string; uom: string; pts: number; data: { accn: string; cik: number; entityName?: string; start?: string; end: string; val: number }[] };

export function frameId(r: FrameRequest) {
  return `${r.taxonomy}/${r.concept}/${r.unit}/${r.period}`;
}

/** The frames API writes a ratio unit with "-per-": EPS is "USD-per-shares", not "USD/shares". */
export function frameUnit(unit: string) {
  return unit.replace("/", "-per-");
}

export function frameUrl(r: FrameRequest) {
  return `https://data.sec.gov/api/xbrl/frames/${r.taxonomy}/${r.concept}/${frameUnit(r.unit)}/${r.period}.json`;
}

/** Keep only well-formed numeric rows; SEC occasionally ships a null or a non-number. */
export function parseFrame(body: FrameResponse | null): FrameRow[] {
  if (!body?.data) return [];
  const out: FrameRow[] = [];
  for (const d of body.data) {
    if (typeof d.val !== "number" || !Number.isFinite(d.val) || typeof d.cik !== "number" || !d.end) continue;
    out.push({ cik: d.cik, val: d.val, end: d.end, ...(d.start ? { start: d.start } : {}), accn: d.accn });
  }
  return out;
}

/** Every filer's value for one concept and period. Empty when SEC has no such frame. Not cached. */
export async function fetchFrame(r: FrameRequest): Promise<FrameRow[]> {
  return parseFrame(await secJson<FrameResponse>(frameUrl(r)));
}

export type ListedCompany = { cik: string; name: string; ticker: string; exchange: string };

type TickersExchange = { fields: string[]; data: (string | number | null)[][] };

/**
 * SEC's ticker file with exchanges, NYSE and Nasdaq only (no OTC or Cboe), one row per company: SEC lists a company's
 * primary ticker first, so later share classes and units of the same CIK are dropped.
 */
export function parseTickersExchange(body: TickersExchange, exchanges: readonly string[] = ["NYSE", "Nasdaq"]): ListedCompany[] {
  const idx = (f: string) => body.fields.indexOf(f);
  const [ci, ni, ti, ei] = [idx("cik"), idx("name"), idx("ticker"), idx("exchange")];
  const seen = new Set<string>();
  const out: ListedCompany[] = [];
  for (const row of body.data) {
    const exchange = row[ei];
    if (typeof exchange !== "string" || !exchanges.includes(exchange)) continue;
    const cik = padCik(String(row[ci]));
    if (seen.has(cik)) continue;
    seen.add(cik);
    out.push({ cik, name: String(row[ni] ?? ""), ticker: String(row[ti] ?? "").toUpperCase(), exchange });
  }
  return out;
}

/** NYSE- and Nasdaq-listed companies from company_tickers_exchange.json. Not cached (about 1 MB, read once a run). */
export async function fetchListedCompanies(): Promise<ListedCompany[]> {
  const body = await secJson<TickersExchange>("https://www.sec.gov/files/company_tickers_exchange.json");
  if (!body) throw new Error("SEC ticker file is missing");
  return parseTickersExchange(body);
}

/** The few facts about a registrant the screen needs from its submissions file. */
export type CompanyProfile = {
  cik: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  /** "MMDD", e.g. "0927". */
  fiscalYearEnd: string | null;
  /** The most recent annual report form in the file: "10-K", "20-F", "40-F", or null when none is listed. */
  annualForm: string | null;
};

type SubmissionsBody = { cik?: string; name?: string; sic?: string; sicDescription?: string; fiscalYearEnd?: string; filings?: { recent?: { form?: string[] } } };

const ANNUAL_FORMS = ["10-K", "10-K/A", "10-KT", "20-F", "20-F/A", "40-F", "40-F/A"];

export function profileFromSubmissions(cik: string, body: SubmissionsBody): CompanyProfile {
  const forms = body.filings?.recent?.form ?? [];
  // The recent list holds the last thousand filings; a very busy filer's 10-K can fall off it, so quarterly reports
  // (10-Q, domestic) or 6-Ks (foreign) stand in for the annual form.
  const annual = forms.find((f) => ANNUAL_FORMS.includes(f)) ?? (forms.includes("10-Q") ? "10-K" : forms.includes("6-K") ? "20-F" : null);
  return {
    cik: padCik(cik),
    name: body.name ?? "",
    sic: body.sic ? String(body.sic) : null,
    sicDescription: body.sicDescription ?? null,
    fiscalYearEnd: body.fiscalYearEnd ?? null,
    annualForm: annual ? annual.replace(/\/A$/, "").replace("10-KT", "10-K") : null,
  };
}

/**
 * A registrant's SIC code, fiscal year end and annual form. The submissions file can be a megabyte for a large filer;
 * only this small profile is cached (two months: SIC codes and fiscal years rarely change), so the whole file never
 * lands in provider_cache.
 */
export async function getCompanyProfile(cik: string): Promise<CompanyProfile | null> {
  const c = padCik(cik);
  return cached(`edgar:profile:${c}`, 60 * 60 * 24 * 60, async () => {
    const body = await secJson<SubmissionsBody>(`https://data.sec.gov/submissions/CIK${c}.json`);
    return body ? profileFromSubmissions(c, body) : null;
  });
}
