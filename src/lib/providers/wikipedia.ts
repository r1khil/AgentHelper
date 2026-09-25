import { cached } from "./cache";
import { tickerToCik } from "./edgar";
import { retry, spaced } from "./limiter";

/**
 * Company background from Wikidata (structured facts) and English Wikipedia (the lead summary). No key; Wikimedia's
 * User-Agent policy asks for a descriptive agent with contact details, and its API guidelines ask for serial requests.
 * Everything here is community-edited: history, leadership and structure only, never financial figures.
 */
const UA = "OwlFundWorkspace/1.0 (https://owlfund-workspace.vercel.app; Hoot research bot)";
const HOST = "wikimedia";
const GAP_MS = 100;
const TTL = 60 * 60 * 24;
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";
const SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";

/** Where a listing counts as a US listing, which is what a bare ticker from the Fund means. */
const US_EXCHANGES: Record<string, string> = { Q13677: "NYSE", Q82059: "Nasdaq", Q846626: "NYSE American" };
const INDEX_LIKE = /\bindex\b|S&P|Russell|Dow Jones|Nasdaq-100|FTSE|MSCI|STOXX|Nikkei|\bDAX\b/i;
const CAPS = { industries: 5, founders: 6, parents: 3, subsidiaries: 8, listings: 4, candidates: 6, search: 5, summaryChars: 1200 };

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type Candidate = { wikidataId: string; label: string; description: string | null; wikipediaTitle: string | null; tickers?: string[] };

export type CompanyBackground = {
  wikidataId: string;
  wikidataUrl: string;
  wikidataModified: string | null;
  label: string;
  description: string | null;
  founded: string | null;
  headquarters: string[];
  ceo: { name: string; since: string | null; current: boolean } | null;
  industries: string[];
  founders: string[];
  parents: string[];
  subsidiaries: { names: string[]; total: number };
  listings: { exchange: string; ticker: string }[];
  website: string | null;
  wikipedia: { title: string; url: string; summary: string; lastEdited: string | null } | null;
};

export type BackgroundResult =
  | { status: "found"; matchedBy: string; retrievedAt: string; company: CompanyBackground }
  | { status: "ambiguous" | "not_found"; matchedBy: string; retrievedAt: string; candidates: Candidate[] };

async function get<T>(fetcher: Fetcher, url: string, accept = "application/json"): Promise<T | null> {
  return spaced(HOST, GAP_MS, () =>
    retry(async () => {
      const res = await fetcher(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`Wikimedia ${res.status} for ${new URL(url).host}`);
      if (!res.ok) throw new Error(`Wikimedia ${res.status} for ${new URL(url).host}`);
      return (await res.json()) as T;
    }),
  );
}

const api = (params: Record<string, string>) => `${WIKIDATA_API}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;

// ---------- Wikidata JSON (only the parts read here) ----------

type Snak = { snaktype: string; datavalue?: { value: unknown; type: string } };
type Statement = { mainsnak: Snak; rank: "preferred" | "normal" | "deprecated"; qualifiers?: Record<string, Snak[]> };
type Entity = {
  id: string;
  modified?: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  claims?: Record<string, Statement[]>;
  sitelinks?: Record<string, { title: string }>;
};

const itemId = (s: Snak | undefined) => ((s?.datavalue?.value as { id?: string } | undefined)?.id ?? null);
const stringValue = (s: Snak | undefined) => (typeof s?.datavalue?.value === "string" ? s.datavalue.value : null);
const timeValue = (s: Snak | undefined) => {
  const v = s?.datavalue?.value as { time?: string; precision?: number } | undefined;
  if (!v?.time) return null;
  // Wikidata writes "+1976-04-01T00:00:00Z" with a precision: 9 = year, 10 = month, 11 = day. Unknown parts are "00".
  const m = v.time.match(/^([+-])(\d+)-(\d\d)-(\d\d)/);
  if (!m) return null;
  const year = `${m[1] === "-" ? "-" : ""}${m[2].replace(/^0+(?=\d{4})/, "")}`;
  if ((v.precision ?? 11) <= 9 || m[3] === "00") return year;
  if (v.precision === 10 || m[4] === "00") return `${year}-${m[3]}`;
  return `${year}-${m[3]}-${m[4]}`;
};
const qualifier = (st: Statement, p: string) => st.qualifiers?.[p]?.[0];
const ended = (st: Statement) => Boolean(qualifier(st, "P582"));

/** Non-deprecated statements, preferred rank first; `currentOnly` drops ones with an end date. */
function statements(e: Entity, p: string, currentOnly = false): Statement[] {
  const all = (e.claims?.[p] ?? []).filter((s) => s.rank !== "deprecated" && s.mainsnak.snaktype === "value");
  const preferred = all.filter((s) => s.rank === "preferred");
  const pool = preferred.length ? preferred : all;
  return currentOnly ? pool.filter((s) => !ended(s)) : pool;
}

/** The present CEO: preferred rank or no end date; otherwise the latest-starting one, marked not current. */
function pickCeo(e: Entity): { id: string; since: string | null; current: boolean } | null {
  const all = statements(e, "P169");
  const current = all.filter((s) => !ended(s));
  const byStart = (a: Statement, b: Statement) => (timeValue(qualifier(b, "P580")) ?? "").localeCompare(timeValue(qualifier(a, "P580")) ?? "");
  const st = [...current].sort(byStart)[0] ?? [...(e.claims?.P169 ?? []).filter((s) => s.rank !== "deprecated")].sort(byStart)[0];
  const id = itemId(st?.mainsnak);
  if (!st || !id) return null;
  return { id, since: timeValue(qualifier(st, "P580")), current: !ended(st) };
}

/** Companies list dozens of country sites; take the preferred one, then one without a country, then the US one. */
function pickWebsite(e: Entity): string | null {
  const all = (e.claims?.P856 ?? []).filter((s) => s.rank !== "deprecated" && stringValue(s.mainsnak));
  const st =
    all.find((s) => s.rank === "preferred") ??
    all.find((s) => !s.qualifiers?.P1001 && !ended(s)) ??
    all.find((s) => s.qualifiers?.P1001?.some((q) => itemId(q) === "Q30")) ??
    all[0];
  return st ? stringValue(st.mainsnak) : null;
}

function listings(e: Entity): { exchangeId: string; ticker: string }[] {
  const out: { exchangeId: string; ticker: string }[] = [];
  for (const st of statements(e, "P414", true)) {
    const ex = itemId(st.mainsnak);
    const ticker = stringValue(qualifier(st, "P249"));
    if (ex && ticker) out.push({ exchangeId: ex, ticker });
  }
  return out.sort((a, b) => Number(!(a.exchangeId in US_EXCHANGES)) - Number(!(b.exchangeId in US_EXCHANGES))).slice(0, 12);
}

async function getEntities(fetcher: Fetcher, ids: string[], props: string): Promise<Record<string, Entity>> {
  const out: Record<string, Entity> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const r = await get<{ entities?: Record<string, Entity> }>(fetcher, api({ action: "wbgetentities", ids: batch.join("|"), props, languages: "en", languagefallback: "1", sitefilter: "enwiki" }));
    Object.assign(out, r?.entities ?? {});
  }
  return out;
}

const label = (e: Entity | undefined, fallback: string) => e?.labels?.en?.value ?? fallback;

// ---------- Resolution ----------

const SUFFIXES = /\b(inc|incorporated|corp|corporation|co|company|plc|ltd|limited|llc|lp|sa|ag|nv|se|the)\b/g;
/** "JPMorgan Chase & Co." and "JPMorgan Chase" compare equal; so do "KKR & Co. Inc." and "KKR". */
export function normalizeName(s: string) {
  return s.toLowerCase().replace(/&/g, " ").replace(/[.,'’()]/g, "").replace(/[-/]/g, " ").replace(SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

/** Items whose SEC Central Index Key (P5531) is this CIK; Wikidata stores it zero-padded, a few items unpadded. */
async function itemsByCik(fetcher: Fetcher, cik: string): Promise<string[]> {
  const padded = cik.padStart(10, "0");
  const bare = padded.replace(/^0+/, "");
  const r = await get<{ query?: { search?: { title: string }[] } }>(fetcher, api({ action: "query", list: "search", srsearch: `haswbstatement:P5531=${padded}|P5531=${bare}`, srlimit: "10", srprop: "" }));
  return (r?.query?.search ?? []).map((s) => s.title);
}

type TickerHit = { id: string; exchangeId: string | null; exchange: string | null; ended: boolean };

/** Items listing this ticker (P249, a qualifier on the stock-exchange statement, or on its own on older items). */
async function itemsByTicker(fetcher: Fetcher, ticker: string): Promise<TickerHit[]> {
  const t = ticker.trim().toUpperCase();
  const variants = [...new Set([t, t.replace(/[-/ ]/g, "."), t.replace(/[./ ]/g, "-")])].map((v) => JSON.stringify(v)).join(" ");
  const query = `SELECT ?item ?ex ?exLabel ?end WHERE {
  VALUES ?ticker { ${variants} }
  { ?item p:P414 ?st . ?st pq:P249 ?ticker ; ps:P414 ?ex . OPTIONAL { ?st pq:P582 ?end } }
  UNION { ?item wdt:P249 ?ticker }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 40`;
  type Row = Record<string, { value: string } | undefined>;
  const r = await get<{ results?: { bindings?: Row[] } }>(fetcher, `${SPARQL}?${new URLSearchParams({ query, format: "json" })}`, "application/sparql-results+json");
  const q = (uri?: string) => uri?.split("/").pop() ?? null;
  return (r?.results?.bindings ?? []).map((b) => ({ id: q(b.item?.value)!, exchangeId: q(b.ex?.value), exchange: b.exLabel?.value ?? null, ended: Boolean(b.end) })).filter((h) => h.id);
}

/**
 * Company-looking items for a name: English Wikipedia's search over articles with a company infobox (the better
 * ranking), then Wikidata's search over items with an industry, a listing or a CIK (airlines and banks use other
 * infoboxes). Merged in that order without duplicates.
 */
async function searchCompanies(fetcher: Fetcher, name: string): Promise<string[]> {
  type Page = { index: number; pageprops?: { wikibase_item?: string } };
  const wiki = await get<{ query?: { pages?: Page[] } }>(
    fetcher,
    `${WIKIPEDIA_API}?${new URLSearchParams({ action: "query", generator: "search", gsrsearch: `${name} hastemplate:"Infobox company"`, gsrlimit: String(CAPS.search), prop: "pageprops", ppprop: "wikibase_item", format: "json", formatversion: "2" })}`,
  );
  const data = await get<{ query?: { search?: { title: string }[] } }>(fetcher, api({ action: "query", list: "search", srsearch: `${name} haswbstatement:P452|P414|P5531`, srlimit: String(CAPS.search), srprop: "" }));
  const fromWiki = [...(wiki?.query?.pages ?? [])].sort((a, b) => a.index - b.index).map((p) => p.pageprops?.wikibase_item);
  return [...new Set([...fromWiki, ...(data?.query?.search ?? []).map((r) => r.title)])].filter((id): id is string => !!id && /^Q\d+$/.test(id));
}

async function candidates(fetcher: Fetcher, ids: string[], tickers?: Map<string, string[]>): Promise<Candidate[]> {
  const list = ids.slice(0, CAPS.candidates);
  if (!list.length) return [];
  const ents = await getEntities(fetcher, list, "labels|descriptions|sitelinks");
  return list.map((id) => ({
    wikidataId: id,
    label: label(ents[id], id),
    description: ents[id]?.descriptions?.en?.value ?? null,
    wikipediaTitle: ents[id]?.sitelinks?.enwiki?.title ?? null,
    ...(tickers?.get(id)?.length ? { tickers: tickers.get(id) } : {}),
  }));
}

/**
 * The one company a name means: the only hit whose label, article title or alias matches the name, or the top hit
 * when several match and it is one of them. Anything else is a guess, so the hits come back as candidates,
 * exact matches first.
 */
async function resolveName(fetcher: Fetcher, name: string): Promise<{ id: string | null; ids: string[] }> {
  const ids = await searchCompanies(fetcher, name);
  if (!ids.length) return { id: null, ids };
  const want = normalizeName(name);
  const ents = await getEntities(fetcher, ids, "labels|aliases|sitelinks");
  const names = (id: string) =>
    [ents[id]?.labels?.en?.value, ents[id]?.sitelinks?.enwiki?.title?.replace(/\s*\(.*\)$/, ""), ...(ents[id]?.aliases?.en ?? []).map((a) => a.value)]
      .filter((s): s is string => !!s)
      .map(normalizeName);
  const exact = ids.filter((id) => names(id).includes(want));
  if (exact.length === 1 || (exact.length > 1 && exact[0] === ids[0])) return { id: exact[0], ids };
  return { id: null, ids: [...exact, ...ids.filter((id) => !exact.includes(id))] };
}

export type BackgroundQuery = { ticker?: string; name?: string; wikidataId?: string };

async function resolve(fetcher: Fetcher, q: BackgroundQuery): Promise<{ id: string; matchedBy: string } | { id: null; matchedBy: string; candidates: Candidate[]; ambiguous: boolean }> {
  if (q.wikidataId) return { id: q.wikidataId.toUpperCase(), matchedBy: `Wikidata id ${q.wikidataId.toUpperCase()}` };
  let name = q.name?.trim();
  if (q.ticker) {
    const ticker = q.ticker.trim().toUpperCase();
    const sec = await tickerToCik(ticker).catch(() => null);
    const byCik = sec ? await itemsByCik(fetcher, sec.cik) : [];
    if (byCik.length === 1) return { id: byCik[0], matchedBy: `SEC CIK ${sec!.cik} (${ticker})` };

    const hits = await itemsByTicker(fetcher, ticker);
    const live = hits.filter((h) => !h.ended);
    const byItem = new Map<string, string[]>();
    for (const h of live) byItem.set(h.id, [...new Set([...(byItem.get(h.id) ?? []), `${ticker} on ${h.exchange ?? "an unnamed exchange"}`])]);
    const us = [...new Set(live.filter((h) => h.exchangeId && h.exchangeId in US_EXCHANGES).map((h) => h.id))];
    // Several items share the CIK (a renamed or merged registrant): the one also listing the ticker wins.
    const shared = byCik.filter((id) => byItem.has(id));
    if (shared.length === 1) return { id: shared[0], matchedBy: `SEC CIK ${sec!.cik} and ticker ${ticker}` };
    if (us.length === 1) {
      const hit = live.find((h) => h.id === us[0] && h.exchangeId && h.exchangeId in US_EXCHANGES)!;
      return { id: us[0], matchedBy: `ticker ${ticker} on ${US_EXCHANGES[hit.exchangeId!]}` };
    }
    const all = [...new Set([...byCik, ...(us.length ? us : [...byItem.keys()])])];
    if (all.length === 1) return { id: all[0], matchedBy: `ticker ${ticker} (${byItem.get(all[0])?.join(", ")})` };
    if (all.length > 1) return { id: null, matchedBy: `ticker ${ticker}`, candidates: await candidates(fetcher, all, byItem), ambiguous: true };
    // Nothing on Wikidata carries the CIK or the ticker; the SEC's registrant name is the best remaining handle.
    name ??= sec?.name;
    if (!name) return { id: null, matchedBy: `ticker ${ticker}`, candidates: [], ambiguous: false };
  }
  if (!name) return { id: null, matchedBy: "nothing to search", candidates: [], ambiguous: false };
  const r = await resolveName(fetcher, name);
  if (r.id) return { id: r.id, matchedBy: `name search "${name}"` };
  return { id: null, matchedBy: `name search "${name}"`, candidates: await candidates(fetcher, r.ids), ambiguous: r.ids.length > 0 };
}

// ---------- Background ----------

type Summary = { title: string; extract?: string; timestamp?: string; type?: string; content_urls?: { desktop?: { page?: string } } };

async function wikipediaSummary(fetcher: Fetcher, title: string) {
  const s = await get<Summary>(fetcher, SUMMARY + encodeURIComponent(title.replace(/ /g, "_")));
  if (!s?.extract || s.type === "disambiguation") return null;
  const summary = s.extract.length > CAPS.summaryChars ? `${s.extract.slice(0, CAPS.summaryChars).replace(/\s+\S*$/, "")}…` : s.extract;
  return { title: s.title, url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`, summary, lastEdited: s.timestamp ?? null };
}

async function background(fetcher: Fetcher, id: string): Promise<CompanyBackground | null> {
  const e = (await getEntities(fetcher, [id], "labels|descriptions|claims|sitelinks|info"))[id];
  if (!e || !e.claims) return null;
  const ceo = pickCeo(e);
  const hq = statements(e, "P159", true).map((s) => itemId(s.mainsnak)).filter((x): x is string => !!x).slice(0, 2);
  const industries = statements(e, "P452").map((s) => itemId(s.mainsnak)).filter((x): x is string => !!x).slice(0, CAPS.industries);
  const founders = statements(e, "P112").map((s) => itemId(s.mainsnak)).filter((x): x is string => !!x).slice(0, CAPS.founders);
  const parents = statements(e, "P749", true).map((s) => itemId(s.mainsnak)).filter((x): x is string => !!x).slice(0, CAPS.parents);
  const subsAll = statements(e, "P355", true).map((s) => itemId(s.mainsnak)).filter((x): x is string => !!x);
  const subs = subsAll.slice(0, CAPS.subsidiaries);
  const lst = listings(e);
  const refIds = [...new Set([...(ceo ? [ceo.id] : []), ...hq, ...industries, ...founders, ...parents, ...subs, ...lst.map((l) => l.exchangeId)])];
  const [labels, wiki] = await Promise.all([
    refIds.length ? getEntities(fetcher, refIds, "labels") : Promise.resolve({} as Record<string, Entity>),
    e.sitelinks?.enwiki?.title ? wikipediaSummary(fetcher, e.sitelinks.enwiki.title) : Promise.resolve(null),
  ]);
  const name = (x: string) => label(labels[x], x);
  return {
    wikidataId: e.id,
    wikidataUrl: `https://www.wikidata.org/wiki/${e.id}`,
    wikidataModified: e.modified ?? null,
    label: label(e, e.id),
    description: e.descriptions?.en?.value ?? null,
    founded: timeValue(statements(e, "P571")[0]?.mainsnak),
    headquarters: hq.map(name),
    ceo: ceo ? { name: name(ceo.id), since: ceo.since, current: ceo.current } : null,
    industries: industries.map(name),
    founders: founders.map(name),
    parents: parents.map(name),
    subsidiaries: { names: subs.map(name), total: subsAll.length },
    listings: lst
      .map((l) => ({ exchange: US_EXCHANGES[l.exchangeId] ?? name(l.exchangeId), ticker: l.ticker }))
      // Index memberships are modeled as "stock exchange" statements too, ticker and all.
      .filter((l) => !INDEX_LIKE.test(l.exchange))
      .slice(0, CAPS.listings),
    website: pickWebsite(e),
    wikipedia: wiki,
  };
}

/**
 * Resolve a company by ticker (SEC CIK, then the Wikidata ticker), name or Wikidata id and return its background.
 * Ambiguous or unknown companies come back as candidates instead of a guess. Cached for a day, candidates included.
 */
export async function getCompanyBackground(q: BackgroundQuery, fetcher: Fetcher = fetch): Promise<BackgroundResult> {
  const key = q.wikidataId ? `id:${q.wikidataId.toUpperCase()}` : q.ticker ? `ticker:${q.ticker.trim().toUpperCase()}` : `name:${normalizeName(q.name ?? "")}`;
  return cached(`wikidata:background:${key}`, TTL, async (): Promise<BackgroundResult> => {
    const retrievedAt = new Date().toISOString();
    const r = await resolve(fetcher, q);
    if (r.id === null) return { status: r.ambiguous ? "ambiguous" : "not_found", matchedBy: r.matchedBy, retrievedAt, candidates: r.candidates };
    const company = await background(fetcher, r.id);
    if (!company) return { status: "not_found", matchedBy: r.matchedBy, retrievedAt, candidates: [] };
    return { status: "found", matchedBy: r.matchedBy, retrievedAt, company };
  });
}
