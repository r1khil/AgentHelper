/**
 * Company names as the app stores them (holdings.company_name, securities.name). SEC's ticker list spells many
 * names in capitals ("AMAZON COM INC") while Yahoo gives the company's own casing ("Amazon.com, Inc."), so a page
 * that mixed the two looked careless. Pure module.
 */

/** Words kept exactly as written here, whatever their position. Keys are upper case. */
const FIXED: Record<string, string> = {
  // Legal suffixes and SEC abbreviations.
  INC: "Inc",
  CORP: "Corp",
  CO: "Co",
  LTD: "Ltd",
  PLC: "Plc",
  LLC: "LLC",
  LP: "LP",
  HLDGS: "Hldgs",
  HLDG: "Hldg",
  GRP: "Grp",
  INTL: "Intl",
  SVCS: "Svcs",
  MGMT: "Mgmt",
  FINL: "Finl",
  TR: "Tr",
  ST: "St",
  JR: "Jr",
  SR: "Sr",
  // Fund families and acronyms that happen to contain vowels.
  ISHARES: "iShares",
  SPDR: "SPDR",
  ETF: "ETF",
  ETN: "ETN",
  ETFS: "ETFs",
  MSCI: "MSCI",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  REIT: "REIT",
  US: "US",
  USA: "USA",
  UK: "UK",
  EU: "EU",
  AI: "AI",
  ESG: "ESG",
  ADR: "ADR",
  ADS: "ADS",
  IBM: "IBM",
  BNY: "BNY",
  NA: "NA",
  II: "II",
  III: "III",
  IV: "IV",
};

/** Joining words, lower case unless they open the name. */
const MINOR = new Set(["OF", "AND", "THE", "FOR", "IN", "ON", "AT", "BY", "TO", "DE"]);

function caseAtom(atom: string, first: boolean): string {
  const up = atom.toUpperCase();
  if (!/[A-Z]/.test(up)) return atom;
  if (FIXED[up]) return FIXED[up];
  if (!first && MINOR.has(up)) return up.toLowerCase();
  if (/\d/.test(up)) return /^\d+(ST|ND|RD|TH)$/.test(up) ? up.toLowerCase() : up; // 1ST → 1st, 3M stays
  if (up.length === 1) return up;
  if (!/[AEIOUY]/.test(up)) return up; // KKR, PNC, CVS, HSBC, QQQ
  if (up.length >= 5 && up.startsWith("MC")) return `Mc${up[2]}${up.slice(3).toLowerCase()}`; // McKesson, McDonalds
  return up[0] + up.slice(1).toLowerCase();
}

function caseWord(word: string, first: boolean): string {
  // Dotted initials (L.P., N.V., S.A.) and ampersand pairs (S&P, AT&T, P&G) stay capitals.
  if (/^([A-Z]\.){2,}$/i.test(word)) return word.toUpperCase();
  if (/^[A-Z]{1,2}&[A-Z]{1,2}$/i.test(word)) return word.toUpperCase();
  // Keep punctuation (commas, periods, hyphens, slashes, apostrophes) and case each alphanumeric run.
  let index = 0;
  return word.replace(/[A-Za-z0-9]+/g, (atom, offset: number, whole: string) => {
    const afterApostrophe = offset > 0 && whole[offset - 1] === "'";
    const out = afterApostrophe ? atom.toLowerCase() : caseAtom(atom, first && index === 0);
    index++;
    return out;
  });
}

/** Tidy whitespace and the HTML entities Yahoo sometimes leaves in names ("Procter &amp; Gamble"). */
export function cleanCompanyName(name: string): string {
  return name
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a name has letters and none of them is lower case, as SEC's list writes most names. */
export function isAllCaps(name: string): boolean {
  return /[A-Z]/.test(name) && !/[a-z]/.test(name);
}

/**
 * Title-case an all-capitals company name: "AMAZON COM INC" → "Amazon.com Inc", "MICROSOFT CORP" → "Microsoft Corp",
 * "KKR & CO INC" → "KKR & Co Inc". Acronyms, fund families and legal suffixes keep their usual spelling, and SEC's
 * state markers ("/DE/") are dropped. A name that already has lower-case letters is returned tidied but unchanged.
 */
export function titleCaseCompanyName(raw: string): string {
  const name = cleanCompanyName(raw);
  if (!isAllCaps(name)) return name;
  const words = name
    .replace(/\s*\/[A-Z]{2,4}\/\s*$/, "")
    .split(" ")
    .filter(Boolean);
  const out: string[] = [];
  words.forEach((word, i) => {
    // SEC strips the dot from dot-com names: "AMAZON COM INC" was "Amazon.com, Inc.".
    if (i > 0 && word.toUpperCase() === "COM" && out.length && !/[,.]$/.test(out[out.length - 1])) {
      out[out.length - 1] += ".com";
      return;
    }
    out.push(caseWord(word, i === 0));
  });
  return out.join(" ");
}

/**
 * The name to store for a ticker, from candidate names in order of preference. The first properly cased candidate
 * wins, so pass the market-data provider's name (Yahoo longName/shortName) before SEC's: it carries the company's
 * own spelling ("Amazon.com, Inc.", "NextEra Energy, Inc."). When every candidate is in capitals, the first one is
 * title-cased; with none, the ticker. A candidate that is just the ticker does not count.
 */
export function pickCompanyName(rawTicker: string, candidates: (string | null | undefined)[]): string {
  const ticker = rawTicker.trim().toUpperCase();
  const usable = candidates.map((s) => (s ? cleanCompanyName(s) : "")).filter((c) => c && c.toUpperCase() !== ticker);
  const cased = usable.find((c) => !isAllCaps(c));
  if (cased) return cased;
  return usable.length ? titleCaseCompanyName(usable[0]) : ticker;
}
