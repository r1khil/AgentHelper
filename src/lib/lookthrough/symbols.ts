/**
 * Symbol cleanup for ETF constituents. Issuers write the same security differently (BRK.B, BRK/B,
 * "4704.JP", "000660 KS", a TSX ticker in its own column), so every list is mapped to Yahoo-style
 * symbols: the form the ledger and daily_closes already use. A foreign listing always keeps an exchange
 * suffix, so a Toronto "K" (Kinross) can never be mistaken for the US "K".
 */

/** Bloomberg exchange codes (as First Trust and Roundhill write them) to Yahoo suffixes. */
const BLOOMBERG_SUFFIX: Record<string, string> = {
  US: "",
  UN: "",
  UW: "",
  UQ: "",
  JP: ".T",
  JT: ".T",
  FP: ".PA",
  CN: ".TO",
  CT: ".TO",
  CV: ".V",
  LN: ".L",
  GR: ".DE",
  GY: ".DE",
  KS: ".KS",
  KQ: ".KQ",
  TT: ".TW",
  TW: ".TW",
  HK: ".HK",
  AU: ".AX",
  AT: ".AX",
  SJ: ".JO",
  SW: ".SW",
  SE: ".SW",
  VX: ".SW",
  NA: ".AS",
  IM: ".MI",
  SM: ".MC",
  SS: ".ST",
  C1: ".SS",
  C2: ".SZ",
  IT: ".TA",
  NO: ".OL",
  DC: ".CO",
  FH: ".HE",
  BZ: ".SA",
  MM: ".MX",
  ID: ".IR",
  BB: ".BR",
  PL: ".LS",
  SP: ".SI",
  IN: ".NS",
  NZ: ".NZ",
};

/** Exchange names as iShares writes them, matched loosely, to Yahoo suffixes. First match wins, so foreign
 * venues that share a brand with a US one (Nasdaq Stockholm) come before the US catch-all. */
const EXCHANGE_SUFFIX: [RegExp, string][] = [
  [/toronto/i, ".TO"],
  [/tsx venture/i, ".V"],
  [/london/i, ".L"],
  [/^asx|australian/i, ".AX"],
  [/hong kong/i, ".HK"],
  [/johannesburg/i, ".JO"],
  [/tokyo/i, ".T"],
  [/kosdaq/i, ".KQ"],
  [/korea/i, ".KS"],
  [/taiwan/i, ".TW"],
  [/shanghai/i, ".SS"],
  [/shenzhen/i, ".SZ"],
  [/xetra|deutsche|frankfurt/i, ".DE"],
  [/euronext paris|paris/i, ".PA"],
  [/euronext amsterdam|amsterdam/i, ".AS"],
  [/six swiss|swiss/i, ".SW"],
  [/borsa italiana|milan/i, ".MI"],
  [/stockholm|nasdaq omx nordic/i, ".ST"],
  [/oslo/i, ".OL"],
  [/copenhagen/i, ".CO"],
  [/helsinki/i, ".HE"],
  [/tel aviv/i, ".TA"],
  [/bolsa mexicana|mexico/i, ".MX"],
  [/sao paulo|b3|bovespa/i, ".SA"],
  [/singapore/i, ".SI"],
  [/national stock exchange of india/i, ".NS"],
  [/istanbul/i, ".IS"],
  [/moscow|standard-classica|micex/i, ".ME"],
  [/^(nyse|nasdaq|cboe|bats|new york|otc)/i, ""],
];

/** Yahoo suffix for an exchange name, "" for a US venue, or null when it isn't recognised. */
export function exchangeSuffix(exchange: string): string | null {
  const name = exchange.trim();
  if (!name || name === "-") return null;
  for (const [re, suffix] of EXCHANGE_SUFFIX) if (re.test(name)) return suffix;
  return null;
}

/** US common and share-class tickers: AAPL, BRK.B, BRK/B, BRK B, BF-B. */
const US_TICKER = /^([A-Z]{1,5})(?:[./ -]([A-Z]{1,2}))?$/;

/** A US ticker in Yahoo form (BRK.B → BRK-B), or null when it doesn't look like one (futures, CVRs, cash). */
export function usSymbol(raw: string): string | null {
  const m = US_TICKER.exec(raw.trim().toUpperCase());
  if (!m) return null;
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

function withSuffix(code: string, suffix: string): string {
  // Yahoo pads Hong Kong codes to four digits: 700 → 0700.HK.
  const base = suffix === ".HK" && /^\d+$/.test(code) ? code.padStart(4, "0") : code;
  return `${base}${suffix}`;
}

/**
 * A Bloomberg-style identifier ("4704.JP", "000660 KS", "OTEX.CN", "BRK/B US") in Yahoo form, or
 * null when it isn't one. A plain US ticker with no exchange code goes through `usSymbol`.
 */
export function bloombergSymbol(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  const m = /^([A-Z0-9]{1,8}(?:[/.][A-Z])?)[ .]([A-Z][A-Z0-9])$/.exec(v);
  if (m && m[2] in BLOOMBERG_SUFFIX) {
    const suffix = BLOOMBERG_SUFFIX[m[2]];
    if (suffix === "") return usSymbol(m[1]);
    return withSuffix(m[1].replace(/[/.]/g, "-"), suffix);
  }
  return usSymbol(v);
}

/**
 * A ticker from a file that lists the exchange separately (iShares). US venues get the US form; a
 * known foreign venue gets its suffix; an unknown foreign venue gets a marker from the country so
 * it stays distinct from any US ticker.
 */
export function listedSymbol(ticker: string, exchange: string, location: string): string | null {
  const t = ticker.trim().toUpperCase();
  if (!t || t === "-") return null;
  const suffix = exchangeSuffix(exchange);
  if (suffix === "") return usSymbol(t);
  // Borsa Istanbul lines carry a ".E" market segment that Yahoo omits: TRALT.E → TRALT.IS.
  if (suffix) return withSuffix((suffix === ".IS" ? t.replace(/\.E$/, "") : t).replace(/[/. ]/g, "-"), suffix);
  if (/united states/i.test(location)) return usSymbol(t);
  const country = location.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "XX";
  return `${t.replace(/[/. ]/g, "-")}.${country}`;
}

/** Share classes of one issuer that are separate lines in a fund but one company for exposure. */
export const ISSUER_ALIASES: Record<string, string> = {
  GOOGL: "GOOG",
  FOXA: "FOX",
  NWSA: "NWS",
  "BRK-A": "BRK-B",
  "005935.KS": "005930.KS",
  UAA: "UA",
  "LEN-B": "LEN",
  "HEI-A": "HEI",
};

/** The symbol exposure is combined under: share classes of one company collapse to one. */
export function issuerKey(symbol: string): string {
  return ISSUER_ALIASES[symbol] ?? symbol;
}
