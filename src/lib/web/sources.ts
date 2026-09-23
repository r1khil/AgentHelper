/**
 * How much a web source can be trusted for research. Primary sources publish the facts themselves (regulators,
 * exchanges, central banks, company investor-relations sites, press-release wires); established outlets are
 * newsrooms with editors and corrections policies; low-quality sources are social media, forums, and
 * content farms that repackage other people's reporting with clickbait. Everything else is "other".
 *
 * Search asks Tavily to prefer primary and established domains and to drop low-quality ones, then re-ranks
 * locally by relevance plus a reliability bonus, after dropping barely relevant results.
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
  "latimes.com",
  "bloomberglaw.com",
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
  "investors.com",
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
const LOW_PUBLISHERS = ["seekingalpha", "seeking alpha", "motley fool", "the motley fool", "fool", "investorplace", "benzinga", "marketbeat", "tipranks", "simply wall st", "zacks", "zacks investment research", "insider monkey", "24/7 wall st", "gurufocus", "stocktwits", "reddit"];

function hostOf(hostOrUrl: string): string {
  let host = hostOrUrl.trim().toLowerCase();
  try {
    if (host.includes("/")) {
      const url = new URL(hostOrUrl.trim());
      // Wire-service click trackers (edge.prnewswire.com/c/link?u=…) point elsewhere: rate the destination.
      const target = url.hostname.startsWith("edge.") ? url.searchParams.get("u") : null;
      if (target && /^https?:\/\//i.test(target) && !new URL(target).hostname.startsWith("edge.")) return hostOf(target);
      host = url.hostname.toLowerCase();
    }
  } catch {
    /* not a URL: treat as a host */
  }
  return host.replace(/^www\./, "").replace(/\.$/, "");
}

const matches = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/** A company's investor-relations subdomain (investor.apple.com, ir.aboutamazon.com), not a site named "investors". */
const isInvestorRelationsHost = (host: string) => /^(investors?|ir)\./.test(host) && host.split(".").length >= 3;

/** Tier for a URL or hostname. Government hosts and company investor-relations subdomains count as primary. */
export function sourceTier(hostOrUrl: string): SourceTier {
  const host = hostOf(hostOrUrl);
  if (!host) return "other";
  if (matches(host, LOW_QUALITY_DOMAINS)) return "low";
  if (matches(host, PRIMARY_DOMAINS) || host.endsWith(".gov") || isInvestorRelationsHost(host)) return "primary";
  if (matches(host, ESTABLISHED_DOMAINS)) return "established";
  return "other";
}

/** Tier for a news publisher name as Finnhub reports it ("Reuters", "SeekingAlpha", "Yahoo"). */
export function publisherTier(name: string): SourceTier {
  const n = name.trim().toLowerCase().replace(/[.\s]+$/, "");
  if (!n) return "other";
  if (n.includes(".")) return sourceTier(n);
  if (LOW_PUBLISHERS.includes(n)) return "low";
  if (PRIMARY_PUBLISHERS.includes(n)) return "primary";
  if (ESTABLISHED_PUBLISHERS.includes(n)) return "established";
  return "other";
}

/**
 * The outlet that actually wrote a syndicated article, when the page says so: TradingView news URLs name the wire
 * (tradingview.com/news/benzinga:…), aggregator pages suffix the title (" - 24/7 Wall St."), and some open with the
 * publisher's name on its own line. Only publishers this module rates are returned, so ordinary titles never match.
 */
export function syndicatedFrom(p: { url: string; title?: string | null; text?: string | null }): { name: string; tier: SourceTier } | null {
  const rated = (name: string) => {
    const tier = publisherTier(name);
    return tier === "other" ? null : { name: name.trim().replace(/[.\s]+$/, ""), tier };
  };
  try {
    const url = new URL(p.url);
    const wire = url.hostname.endsWith("tradingview.com") ? /^\/news\/([a-z0-9_-]+):/i.exec(url.pathname)?.[1] : null;
    const hit = wire ? rated(wire.replace(/[_-]+/g, " ")) : null;
    if (hit) return hit;
  } catch {
    /* not a URL */
  }
  const suffix = p.title ? /\s[-|–—]\s([^-|–—]{2,40})$/.exec(p.title.trim())?.[1] : null;
  const fromTitle = suffix ? rated(suffix) : null;
  if (fromTitle) return fromTitle;
  const firstLine = p.text?.trimStart().split("\n", 1)[0] ?? "";
  return firstLine.length <= 40 ? rated(firstLine) : null;
}

/**
 * Wire copy carried by a licensed redistributor (Investing.com, Yahoo): the story opens with the agency's dateline,
 * "SHANGHAI (Reuters) -" or "(Bloomberg) --", within its first few hundred characters.
 */
const WIRE_DATELINES: { name: string; tier: SourceTier; re: RegExp }[] = [
  { name: "Reuters", tier: "established", re: /\(Reuters\)\s*[-–—]/ },
  { name: "AP", tier: "established", re: /\(AP\)\s*[-–—]/ },
  { name: "Bloomberg", tier: "established", re: /\(Bloomberg\)\s*[-–—]/ },
  { name: "Dow Jones", tier: "established", re: /\b(Provided by|By) Dow Jones\b|\(MarketWatch\)\s*[-–—]/ },
];
export const WIRE_DATELINE_WINDOW = 800;
export function wireCopyOf(text: string | null | undefined): { name: string; tier: SourceTier } | null {
  if (!text) return null;
  const head = text.slice(0, WIRE_DATELINE_WINDOW);
  const hit = WIRE_DATELINES.find((w) => w.re.test(head));
  return hit ? { name: hit.name, tier: hit.tier } : null;
}

/**
 * Tier of a page, taking syndication into account: a Benzinga story reposted on TradingView, or a 24/7 Wall St. piece
 * served through Yahoo, is rated as its original publisher when that is lower than the host. The one upgrade: an
 * unrated redistributor carrying an agency's wire copy (a dateline, not a mention) is rated as the agency. Low-rated
 * hosts are never upgraded, so a content farm cannot borrow a dateline.
 */
export function pageTier(p: { url: string; title?: string | null; text?: string | null }): { tier: SourceTier; syndicatedFrom: string | null } {
  const host = sourceTier(p.url);
  const orig = syndicatedFrom(p);
  if (orig && tierRank(orig.tier) > tierRank(host)) return { tier: orig.tier, syndicatedFrom: orig.name };
  const wire = host === "other" ? wireCopyOf(p.text) : null;
  if (wire && tierRank(wire.tier) < tierRank(host)) return { tier: wire.tier, syndicatedFrom: wire.name };
  return { tier: host, syndicatedFrom: orig && orig.tier !== host ? orig.name : null };
}

const TIER_ORDER: SourceTier[] = ["primary", "established", "other", "low"];
const tierRank = (t: SourceTier) => TIER_ORDER.indexOf(t);

/**
 * Stock quote and ticker hub pages (prices, charts, a headline list). They rank high for "why did X move" searches
 * but explain nothing, and prices come from the quote tools.
 */
const QUOTE_PAGE_PATTERNS = [
  /\/market-data\/quotes\//i,
  /\/quotes?\/[a-z0-9.^:=-]{1,12}\/?$/i,
  /\/investing\/(stock|fund|index)\/[a-z0-9.^-]{1,12}\/?$/i,
  /\/finance\/quote\//i,
  /\/market-activity\/(stocks|etf|funds)\/[a-z0-9.^-]{1,12}\/?$/i,
  /\/(stocks|symbols)\/[a-z0-9.^-]{1,12}\/?$/i,
];
export function isQuotePage(url: string): boolean {
  try {
    const u = new URL(url);
    return QUOTE_PAGE_PATTERNS.some((re) => re.test(u.pathname));
  } catch {
    return false;
  }
}

/**
 * Relevance bonus for reliable sources. Search relevance scores run 0–1; the bonus lets a reliable page outrank a
 * slightly more relevant unrated one without letting an off-topic page from a trusted site jump the queue.
 */
export const TIER_BONUS: Record<SourceTier, number> = { primary: 0.15, established: 0.1, other: 0, low: -1 };
/** Results scoring below this share of the best result's relevance (or below the absolute floor) are dropped. */
export const RELATIVE_RELEVANCE_FLOOR = 0.25;
/**
 * Across production searches on 2026-09-23, on-topic articles scored about 0.3 and up, while filler from the
 * preferred-domain padding and off-topic pages scored 0.03–0.25. When every result is filler, the relative floor
 * alone keeps them all.
 */
export const ABSOLUTE_RELEVANCE_FLOOR = 0.3;

/**
 * Drops results that are barely relevant to the query, then orders the rest by relevance plus a reliability bonus
 * (ties keep the original order). Searches that prefer trusted domains pad the pool with off-topic pages from
 * those domains; the floor removes them.
 */
export function rankByReliability<T>(items: T[], tier: (x: T) => SourceTier, score: (x: T) => number): T[] {
  const top = Math.max(0, ...items.map(score));
  const floor = Math.max(ABSOLUTE_RELEVANCE_FLOOR, top * RELATIVE_RELEVANCE_FLOOR);
  return items
    .map((x, i) => ({ x, i, s: score(x), t: tier(x) }))
    .filter((e) => e.s >= floor && e.t !== "low")
    .sort((a, b) => b.s + TIER_BONUS[b.t] - (a.s + TIER_BONUS[a.t]) || a.i - b.i)
    .map((e) => e.x);
}

/** Outlets whose articles are subscriber-only; read_url usually gets the teaser and site chrome. */
export const HARD_PAYWALL_DOMAINS = ["wsj.com", "ft.com", "bloomberg.com", "barrons.com", "economist.com", "theinformation.com", "investors.com", "nytimes.com", "washingtonpost.com"];
const PAYWALL_PHRASES = /subscribe (now )?to (continue|keep) reading|continue reading (with|your) (a )?subscription|already a subscriber|subscriber[- ]only|subscribers only|to continue reading|create a free account to (continue|read)|this (article|content) is (reserved|available) (for|to) (subscribers|members)|sign in to (continue|read)|unlock this article|become a (member|subscriber) to read/i;
/** Readable text below this on a hard-paywall outlet is a teaser. */
export const PAYWALL_TEASER_CHARS = 5000;

/** Whether read_url most likely got a paywall teaser rather than the article. */
export function looksPaywalled(url: string, text: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  const hard = HARD_PAYWALL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  if (hard && text.trim().length < PAYWALL_TEASER_CHARS) return true;
  return text.length < 20_000 && PAYWALL_PHRASES.test(text);
}

export const TIER_LABEL: Record<SourceTier, string> = {
  primary: "Primary source (regulator, exchange, company, or press-release wire)",
  established: "Established news outlet",
  other: "Unrated website: corroborate before relying on it",
  low: "Low-reliability source (social, forum, or content farm): do not cite",
};
