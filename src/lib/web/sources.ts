/**
 * How much a web source can be trusted for research. Primary sources publish the facts themselves (regulators,
 * exchanges, central banks, company investor-relations sites, press-release wires); established outlets are
 * newsrooms with editors and corrections policies; low-quality sources are social media, forums, and
 * content farms that repackage other people's reporting with clickbait. Everything else is "other".
 *
 * Search asks Tavily to prefer primary and established domains and to drop low-quality ones, then re-ranks
 * locally so the order holds even when the provider ignores the preference.
 */
export type SourceTier = "primary" | "established" | "other" | "low";

export const PRIMARY_DOMAINS = [
  "sec.gov",
  "federalreserve.gov",
  "newyorkfed.org",
  "stlouisfed.org",
  "treasury.gov",
  "bls.gov",
  "bea.gov",
  "census.gov",
  "fdic.gov",
  "occ.gov",
  "cftc.gov",
  "ftc.gov",
  "justice.gov",
  "finra.org",
  "nyse.com",
  "cmegroup.com",
  "ecb.europa.eu",
  "bankofengland.co.uk",
  "imf.org",
  "bis.org",
  "worldbank.org",
  "oecd.org",
  "businesswire.com",
  "prnewswire.com",
  "globenewswire.com",
];

export const ESTABLISHED_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "barrons.com",
  "marketwatch.com",
  "cnbc.com",
  "economist.com",
  "nytimes.com",
  "washingtonpost.com",
  "axios.com",
  "fortune.com",
  "theinformation.com",
  "bbc.com",
  "npr.org",
  "politico.com",
  "americanbanker.com",
  "institutionalinvestor.com",
  "pionline.com",
  "spglobal.com",
  "moodys.com",
  "fitchratings.com",
  "morningstar.com",
  "investopedia.com",
];

/** Excluded from search results: unvetted, anonymous, or clickbait-driven. */
export const LOW_QUALITY_DOMAINS = [
  "reddit.com",
  "stocktwits.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "quora.com",
  "medium.com",
  "seekingalpha.com",
  "fool.com",
  "investorplace.com",
  "benzinga.com",
  "marketbeat.com",
  "tipranks.com",
  "simplywall.st",
  "zacks.com",
  "insidermonkey.com",
  "247wallst.com",
  "gurufocus.com",
  "ainvest.com",
  "finbold.com",
  "coincodex.com",
  "wallstreetzen.com",
  "stockstory.org",
];

/** Finnhub reports a publisher name rather than a domain. */
const PRIMARY_PUBLISHERS = ["sec", "business wire", "businesswire", "pr newswire", "prnewswire", "globenewswire", "globe newswire"];
const ESTABLISHED_PUBLISHERS = ["reuters", "associated press", "ap", "bloomberg", "wsj", "wall street journal", "dow jones", "dowjones", "financial times", "barron's", "barrons", "marketwatch", "cnbc", "the economist", "new york times", "axios", "fortune", "morningstar"];
const LOW_PUBLISHERS = ["seekingalpha", "seeking alpha", "motley fool", "fool", "investorplace", "benzinga", "marketbeat", "tipranks", "simply wall st", "zacks", "insider monkey", "24/7 wall st", "gurufocus", "stocktwits", "reddit"];

const TIER_RANK: Record<SourceTier, number> = { primary: 0, established: 1, other: 2, low: 3 };

function hostOf(hostOrUrl: string): string {
  let host = hostOrUrl.trim().toLowerCase();
  try {
    if (host.includes("/")) host = new URL(host).hostname;
  } catch {
    /* not a URL: treat as a host */
  }
  return host.replace(/^www\./, "").replace(/\.$/, "");
}

const matches = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/** Tier for a URL or hostname. Government hosts and company investor-relations subdomains count as primary. */
export function sourceTier(hostOrUrl: string): SourceTier {
  const host = hostOf(hostOrUrl);
  if (!host) return "other";
  if (matches(host, LOW_QUALITY_DOMAINS)) return "low";
  if (matches(host, PRIMARY_DOMAINS) || host.endsWith(".gov") || /^(investors?|ir)\./.test(host)) return "primary";
  if (matches(host, ESTABLISHED_DOMAINS)) return "established";
  return "other";
}

/** Tier for a news publisher name as Finnhub reports it ("Reuters", "SeekingAlpha", "Yahoo"). */
export function publisherTier(name: string): SourceTier {
  const n = name.trim().toLowerCase();
  if (!n) return "other";
  if (n.includes(".")) return sourceTier(n);
  if (LOW_PUBLISHERS.includes(n)) return "low";
  if (PRIMARY_PUBLISHERS.includes(n)) return "primary";
  if (ESTABLISHED_PUBLISHERS.includes(n)) return "established";
  return "other";
}

export function tierRank(t: SourceTier) {
  return TIER_RANK[t];
}

/** Stable sort: better tiers first, then the given score (higher first), then original order. */
export function rankByTier<T>(items: T[], tier: (x: T) => SourceTier, score: (x: T) => number = () => 0): T[] {
  return items
    .map((x, i) => ({ x, i, r: tierRank(tier(x)), s: score(x) }))
    .sort((a, b) => a.r - b.r || b.s - a.s || a.i - b.i)
    .map((e) => e.x);
}

export const TIER_LABEL: Record<SourceTier, string> = {
  primary: "Primary source (regulator, exchange, company, or press-release wire)",
  established: "Established news outlet",
  other: "Unrated website: corroborate before relying on it",
  low: "Low-reliability source (social, forum, or content farm): do not cite",
};
