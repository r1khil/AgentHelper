import { DateTime } from "luxon";
import { BENCHMARK_REFERENCE, ETF_BY_SECTOR, type GicsSector } from "@/lib/attribution/sectors";
import { coveragePct, fromYahooTop, parseFirstTrustHtml, parseIsharesCsv, parseRoundhillCsv, parseSsgaXlsx, type ParsedHoldings } from "./parse";
import { fmtPct } from "@/lib/format";

/**
 * Where each ETF's full daily holdings file lives. All are public issuer pages fetched with an ordinary
 * browser user agent; no sign-in, no API keys. An ETF missing from here falls back to Yahoo's top 10.
 */
export type EtfSourceSpec =
  | { kind: "ssga" }
  | { kind: "ishares"; productId: string; slug: string }
  | { kind: "first-trust" }
  | { kind: "roundhill" };

const SECTOR_BY_ETF = Object.fromEntries(Object.entries(ETF_BY_SECTOR).map(([sector, etf]) => [etf, sector])) as Record<string, GicsSector>;

export const ETF_SOURCES: Record<string, EtfSourceSpec> = {
  SPY: { kind: "ssga" },
  KRE: { kind: "ssga" },
  ...Object.fromEntries(Object.values(ETF_BY_SECTOR).map((etf) => [etf, { kind: "ssga" } as EtfSourceSpec])),
  SOXX: { kind: "ishares", productId: "239705", slug: "ishares-semiconductor-etf" },
  RING: { kind: "ishares", productId: "239654", slug: "ishares-msci-global-gold-miners-etf" },
  IYK: { kind: "ishares", productId: "239505", slug: "ishares-us-consumer-staples-etf" },
  SKYY: { kind: "first-trust" },
  CIBR: { kind: "first-trust" },
  TDIV: { kind: "first-trust" },
  DRAM: { kind: "roundhill" },
};

/**
 * Lists kept whether or not the Fund holds them: SPY is the stock-level benchmark (active weights,
 * Active Share), and the sector SPDRs together say which GICS sector each S&P 500 name is in.
 */
export const REFERENCE_ETFS = [BENCHMARK_REFERENCE, ...Object.values(ETF_BY_SECTOR)];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const TIMEOUT_MS = 20_000;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function get(fetcher: Fetcher, url: string, accept: string): Promise<Response> {
  const res = await fetcher(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res;
}

export function sourceUrl(etf: string, spec: EtfSourceSpec, date?: string): string {
  const t = etf.toUpperCase();
  switch (spec.kind) {
    case "ssga":
      return `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${t.toLowerCase()}.xlsx`;
    case "ishares":
      return `https://www.ishares.com/us/products/${spec.productId}/${spec.slug}/latest-holdings.csv`;
    case "first-trust":
      return `https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=${encodeURIComponent(t)}`;
    case "roundhill": {
      // One file per day for all Roundhill funds, named by US date: ..._Holdings_09242026.csv.
      const d = DateTime.fromISO(date ?? DateTime.now().setZone("America/New_York").toISODate()!);
      return `https://www.roundhillinvestments.com/assets/data/FilepointRoundhill.40RU.RU_Holdings_${d.toFormat("MMddyyyy")}.csv`;
    }
  }
}

/** The issuer's full list for one ETF. Throws when the file can't be fetched or doesn't parse. */
export async function fetchIssuerHoldings(etf: string, opts: { fetcher?: Fetcher; today?: string } = {}): Promise<ParsedHoldings> {
  const t = etf.toUpperCase();
  const spec = ETF_SOURCES[t];
  if (!spec) throw new Error(`${t}: no issuer source configured`);
  const fetcher = opts.fetcher ?? fetch;
  switch (spec.kind) {
    case "ssga": {
      const res = await get(fetcher, sourceUrl(t, spec), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*");
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(`${t}: State Street returned ${res.headers.get("content-type") ?? "something"} instead of an .xlsx`);
      return parseSsgaXlsx(t, bytes, { sector: SECTOR_BY_ETF[t] ?? null });
    }
    case "ishares": {
      const text = await (await get(fetcher, sourceUrl(t, spec), "text/csv,*/*")).text();
      if (!/^Ticker,Name,/m.test(text)) throw new Error(`${t}: iShares returned a page instead of the holdings CSV`);
      return parseIsharesCsv(t, text);
    }
    case "first-trust":
      return parseFirstTrustHtml(t, await (await get(fetcher, sourceUrl(t, spec), "text/html,*/*")).text());
    case "roundhill": {
      // Today's file may not be posted yet; walk back up to ten days.
      const today = DateTime.fromISO(opts.today ?? DateTime.now().setZone("America/New_York").toISODate()!);
      let last: unknown = null;
      const deadline = Date.now() + 45_000;
      for (let back = 0; back <= 10 && Date.now() < deadline; back++) {
        const url = sourceUrl(t, spec, today.minus({ days: back }).toISODate()!);
        try {
          const text = await (await get(fetcher, url, "text/csv,*/*")).text();
          if (!text.startsWith("Date,Account")) throw new Error("not a holdings file");
          return parseRoundhillCsv(t, text);
        } catch (e) {
          last = e;
        }
      }
      throw new Error(`${t}: no Roundhill holdings file in the last ten days (${last instanceof Error ? last.message : String(last)})`);
    }
  }
}

/** A list that parses but looks wrong (a changed layout) is treated as a failure, not stored. */
export function plausible(list: ParsedHoldings): string | null {
  if (list.constituents.length < 3) return `only ${list.constituents.length} constituents`;
  if (coveragePct(list) < 20) return `constituents cover only ${fmtPct(coveragePct(list), 1)}`;
  return null;
}

export type FetchedList = { list: ParsedHoldings; issuerError: string | null };
export type TopHoldings = (etf: string) => Promise<{ symbol: string; name: string; weightPct: number }[]>;

/**
 * The issuer's full list when it can be fetched, otherwise Yahoo's top 10 with the issuer's error kept
 * so the page can say why coverage is partial. Throws only when both fail.
 */
export async function fetchEtfHoldings(etf: string, opts: { fetcher?: Fetcher; today?: string; topHoldings?: TopHoldings } = {}): Promise<FetchedList> {
  const t = etf.toUpperCase();
  let issuerError: string | null = null;
  if (ETF_SOURCES[t]) {
    try {
      const list = await fetchIssuerHoldings(t, opts);
      const bad = plausible(list);
      if (!bad) return { list, issuerError: null };
      issuerError = `${t}: ${bad}`;
    } catch (e) {
      issuerError = e instanceof Error ? e.message : String(e);
    }
  } else {
    issuerError = `${t}: no issuer source configured`;
  }
  const topHoldings = opts.topHoldings ?? (async (s: string) => (await import("@/lib/providers/yahoo")).getFundTopHoldings(s));
  const top = await topHoldings(t);
  if (!top.length) throw new Error(`${issuerError}; Yahoo has no top holdings for ${t}`);
  const today = opts.today ?? DateTime.now().setZone("America/New_York").toISODate()!;
  return { list: fromYahooTop(t, today, top), issuerError };
}
