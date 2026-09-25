import { beforeEach, describe, expect, it, vi } from "vitest";

// No database, no rate-limit waits, no SEC call: the provider cache and limiter pass through, EDGAR is stubbed.
vi.mock("./cache", () => ({ cached: (_k: string, _t: number, fn: () => Promise<unknown>) => fn() }));
vi.mock("./limiter", () => ({ spaced: (_h: string, _ms: number, fn: () => Promise<unknown>) => fn(), retry: (fn: () => Promise<unknown>) => fn() }));
const tickerToCik = vi.fn();
vi.mock("./edgar", () => ({ tickerToCik: (t: string) => tickerToCik(t) }));

import { getCompanyBackground, normalizeName, type Fetcher } from "./wikipedia";

// ---------- Handwritten fixtures, trimmed from the live Q312 (Apple Inc.) entity and API responses ----------

const item = (id: string) => ({ snaktype: "value", datavalue: { type: "wikibase-entityid", value: { "entity-type": "item", id } } });
const str = (value: string) => ({ snaktype: "value", datavalue: { type: "string", value } });
const time = (t: string, precision: number) => ({ snaktype: "value", datavalue: { type: "time", value: { time: t, precision } } });
const st = (mainsnak: object, qualifiers: Record<string, object[]> = {}, rank = "normal") => ({ mainsnak, qualifiers, rank });

const apple = {
  id: "Q312",
  modified: "2026-09-22T09:50:30Z",
  labels: { en: { value: "Apple Inc." } },
  descriptions: { en: { value: "American multinational technology company based in Cupertino, California" } },
  sitelinks: { enwiki: { title: "Apple Inc." } },
  claims: {
    P571: [st(time("+1976-04-01T00:00:00Z", 11))],
    P159: [st(item("Q189471"), { P582: [time("+2018-00-00T00:00:00Z", 9)] }), st(item("Q189471"), { P580: [time("+2018-00-00T00:00:00Z", 9)] }, "preferred"), st(item("Q22041180"))],
    P169: [
      st(item("Q19837"), { P580: [time("+1997-09-01T00:00:00Z", 10)], P582: [time("+2011-08-23T00:00:00Z", 11)] }),
      st(item("Q265852"), { P580: [time("+2011-08-24T00:00:00Z", 11)], P582: [time("+2026-08-31T00:00:00Z", 11)] }),
      st(item("Q106028933"), { P580: [time("+2026-09-01T00:00:00Z", 11)] }, "preferred"),
    ],
    P452: [st(item("Q880371")), st(item("Q581105"))],
    P112: [st(item("Q483382")), st(item("Q19837"))],
    P355: Array.from({ length: 10 }, (_, i) => st(item(`Q9${i}`))),
    P414: [
      st(item("Q217475"), { P249: [str("6689")], P582: [time("+2004-12-25T00:00:00Z", 11)] }),
      st(item("Q242345"), { P249: [str("AAPL")] }),
      st(item("Q82059"), { P249: [str("AAPL")] }),
    ],
    P856: [
      st(str("https://apple.com/de/"), { P1001: [item("Q183")] }),
      st(str("https://mac.com/"), {}, "deprecated"),
      st(str("https://apple.com/"), { P1001: [item("Q30")] }),
    ],
  },
};

const labels: Record<string, string> = {
  Q189471: "Cupertino",
  Q106028933: "John Ternus",
  Q880371: "software industry",
  Q581105: "consumer electronics",
  Q483382: "Steve Wozniak",
  Q19837: "Steve Jobs",
  Q82059: "Nasdaq",
  Q242345: "S&P 500",
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Q9${i}`, `Subsidiary ${i}`])),
};

const appleSummary = {
  type: "standard",
  title: "Apple Inc.",
  timestamp: "2026-09-19T03:07:36Z",
  extract: "Apple Inc. is an American multinational technology company headquartered in Cupertino, California.",
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Apple_Inc." } },
};

type Route = { match: (u: URL) => boolean; body: unknown; status?: number };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake fetch that answers by URL (a function body sees the URL) and records every request with its headers. */
function fakeFetch(routes: Route[]) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = routes.find((x) => x.match(u));
    if (!r) throw new Error(`unexpected request ${u}`);
    return json(typeof r.body === "function" ? r.body(u) : r.body, r.status);
  };
  return { fetcher, calls };
}

const isEntities = (props: string) => (u: URL) => u.searchParams.get("action") === "wbgetentities" && u.searchParams.get("props") === props;
const entityLabels = (u: URL) => ({ entities: Object.fromEntries(u.searchParams.get("ids")!.split("|").map((id) => [id, { id, labels: labels[id] ? { en: { value: labels[id] } } : {} }])) });

/** Routes for fetching Apple's background once Q312 is resolved. */
const appleRoutes = (): Route[] => [
  { match: isEntities("labels|descriptions|claims|sitelinks|info"), body: { entities: { Q312: apple } } },
  { match: isEntities("labels"), body: entityLabels },
  { match: (u) => u.pathname.startsWith("/api/rest_v1/page/summary/"), body: appleSummary },
];

const sparql = (rows: { item: string; ex?: string; exLabel?: string; end?: string }[]) => ({
  results: {
    bindings: rows.map((r) => ({
      item: { value: `http://www.wikidata.org/entity/${r.item}` },
      ...(r.ex ? { ex: { value: `http://www.wikidata.org/entity/${r.ex}` } } : {}),
      ...(r.exLabel ? { exLabel: { value: r.exLabel } } : {}),
      ...(r.end ? { end: { value: r.end } } : {}),
    })),
  },
});

beforeEach(() => tickerToCik.mockReset());

describe("company background", () => {
  it("resolves a ticker through its SEC CIK and keeps the payload to current, capped facts", async () => {
    tickerToCik.mockResolvedValue({ cik: "0000320193", name: "Apple Inc." });
    const f = fakeFetch([{ match: (u) => (u.searchParams.get("srsearch") ?? "").startsWith("haswbstatement:P5531="), body: { query: { search: [{ title: "Q312" }] } } }, ...appleRoutes()]);
    const r = await getCompanyBackground({ ticker: "aapl" }, f.fetcher);
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.matchedBy).toBe("SEC CIK 0000320193 (AAPL)");
    const c = r.company;
    expect(c).toMatchObject({
      wikidataId: "Q312",
      label: "Apple Inc.",
      founded: "1976-04-01",
      headquarters: ["Cupertino"],
      ceo: { name: "John Ternus", since: "2026-09-01", current: true },
      industries: ["software industry", "consumer electronics"],
      founders: ["Steve Wozniak", "Steve Jobs"],
      website: "https://apple.com/",
      wikipedia: { title: "Apple Inc.", url: "https://en.wikipedia.org/wiki/Apple_Inc.", lastEdited: "2026-09-19T03:07:36Z" },
    });
    // The delisted Tokyo line and the S&P 500 "listing" drop out.
    expect(c.listings).toEqual([{ exchange: "Nasdaq", ticker: "AAPL" }]);
    expect(c.subsidiaries.names).toHaveLength(8);
    expect(c.subsidiaries.total).toBe(10);
    // The CIK search covers the padded and unpadded forms Wikidata uses.
    expect(f.calls[0].url.searchParams.get("srsearch")).toBe("haswbstatement:P5531=0000320193|P5531=320193");
    // Every request identifies the app per Wikimedia's User-Agent policy.
    for (const call of f.calls) expect(call.headers["User-Agent"]).toMatch(/^OwlFundWorkspace\/1\.0 \(https:\/\/owlfund-workspace\.vercel\.app; .*bot\)$/);
  });

  it("falls back to the Wikidata ticker and returns candidates when it names several US companies", async () => {
    tickerToCik.mockResolvedValue(null);
    const { fetcher } = fakeFetch([
      { match: (u) => u.hostname === "query.wikidata.org", body: sparql([{ item: "Q1", ex: "Q13677", exLabel: "New York Stock Exchange" }, { item: "Q2", ex: "Q82059", exLabel: "Nasdaq" }, { item: "Q3", ex: "Q13677", exLabel: "New York Stock Exchange", end: "2010-01-01T00:00:00Z" }]) },
      {
        match: isEntities("labels|descriptions|sitelinks"),
        body: { entities: { Q1: { id: "Q1", labels: { en: { value: "Alpha Corp" } }, descriptions: { en: { value: "bank" } } }, Q2: { id: "Q2", labels: { en: { value: "Alpha Tech" } }, sitelinks: { enwiki: { title: "Alpha Tech" } } } } },
      },
    ]);
    const r = await getCompanyBackground({ ticker: "ALP" }, fetcher);
    expect(r.status).toBe("ambiguous");
    if (r.status === "found") return;
    // The delisted Q3 is not a candidate.
    expect(r.candidates).toEqual([
      { wikidataId: "Q1", label: "Alpha Corp", description: "bank", wikipediaTitle: null, tickers: ["ALP on New York Stock Exchange"] },
      { wikidataId: "Q2", label: "Alpha Tech", description: null, wikipediaTitle: "Alpha Tech", tickers: ["ALP on Nasdaq"] },
    ]);
  });

  it("takes the one US listing when the same ticker also trades abroad", async () => {
    tickerToCik.mockResolvedValue(null);
    const f = fakeFetch([
        { match: (u) => u.hostname === "query.wikidata.org", body: sparql([{ item: "Q999", ex: "Q55", exLabel: "Tokyo Stock Exchange" }, { item: "Q312", ex: "Q82059", exLabel: "Nasdaq" }]) },
        ...appleRoutes(),
    ]);
    const r = await getCompanyBackground({ ticker: "AAPL" }, f.fetcher);
    expect(r.status).toBe("found");
    expect(r.matchedBy).toBe("ticker AAPL on Nasdaq");
    // Share-class tickers are tried with a dot and a dash.
    const q = f.calls.find((c) => c.url.hostname === "query.wikidata.org")!.url.searchParams.get("query")!;
    expect(q).toContain('VALUES ?ticker { "AAPL" }');
    await getCompanyBackground({ ticker: "BRK-B" }, f.fetcher);
    const q2 = f.calls.filter((c) => c.url.hostname === "query.wikidata.org").at(-1)!.url.searchParams.get("query")!;
    expect(q2).toContain('"BRK-B" "BRK.B"');
  });

  it("picks the exact name match from the merged Wikipedia and Wikidata searches", async () => {
    const f = fakeFetch([
        { match: (u) => u.hostname === "en.wikipedia.org" && u.searchParams.get("generator") === "search", body: { query: { pages: [{ index: 2, pageprops: { wikibase_item: "Q312" } }, { index: 1, pageprops: { wikibase_item: "Q621231" } }] } } },
        { match: (u) => u.searchParams.get("list") === "search", body: { query: { search: [{ title: "Q312" }] } } },
        {
          match: isEntities("labels|aliases|sitelinks"),
          body: { entities: { Q621231: { id: "Q621231", labels: { en: { value: "Apple Corps" } } }, Q312: { id: "Q312", labels: { en: { value: "Apple Inc." } }, aliases: { en: [{ value: "Apple Computer, Inc." }] } } } },
        },
        ...appleRoutes(),
    ]);
    const r = await getCompanyBackground({ name: "Apple Computer" }, f.fetcher);
    expect(r.status).toBe("found");
    if (r.status === "found") expect(r.company.wikidataId).toBe("Q312");
    const search = f.calls.find((c) => c.url.searchParams.get("generator") === "search")!;
    expect(search.url.searchParams.get("gsrsearch")).toBe('Apple Computer hastemplate:"Infobox company"');
  });

  it("returns candidates, exact matches first, when a name fits several companies or none by name", async () => {
    const { fetcher } = fakeFetch([
      { match: (u) => u.hostname === "en.wikipedia.org", body: { query: { pages: [{ index: 1, pageprops: { wikibase_item: "Q94743" } }, { index: 2, pageprops: { wikibase_item: "Q85755105" } }] } } },
      { match: (u) => u.searchParams.get("list") === "search", body: { query: { search: [{ title: "Q188920" }] } } },
      {
        match: isEntities("labels|aliases|sitelinks"),
        body: {
          entities: {
            Q94743: { id: "Q94743", labels: { en: { value: "Delta Lloyd Group" } } },
            Q85755105: { id: "Q85755105", labels: { en: { value: "DELTA" } }, sitelinks: { enwiki: { title: "Delta (company)" } } },
            Q188920: { id: "Q188920", labels: { en: { value: "Delta Air Lines" } }, aliases: { en: [{ value: "Delta" }] } },
          },
        },
      },
      {
        match: isEntities("labels|descriptions|sitelinks"),
        body: { entities: { Q94743: { id: "Q94743", labels: { en: { value: "Delta Lloyd Group" } } }, Q85755105: { id: "Q85755105", labels: { en: { value: "DELTA" } } }, Q188920: { id: "Q188920", labels: { en: { value: "Delta Air Lines" } } } } },
      },
    ]);
    const r = await getCompanyBackground({ name: "Delta" }, fetcher);
    expect(r.status).toBe("ambiguous");
    if (r.status === "found") return;
    expect(r.candidates.map((c) => c.wikidataId)).toEqual(["Q85755105", "Q188920", "Q94743"]);
  });

  it("reports nothing found without guessing", async () => {
    tickerToCik.mockResolvedValue(null);
    const { fetcher } = fakeFetch([{ match: (u) => u.hostname === "query.wikidata.org", body: sparql([]) }]);
    const r = await getCompanyBackground({ ticker: "ZZZZQ" }, fetcher);
    expect(r).toMatchObject({ status: "not_found", candidates: [] });
  });

  it("skips a missing or disambiguation Wikipedia page but keeps the Wikidata facts", async () => {
    const noArticle = { ...apple, id: "Q5", sitelinks: { enwiki: { title: "Apple (disambiguation)" } }, claims: { P571: [st(time("+1925-00-00T00:00:00Z", 9))] } };
    const { fetcher } = fakeFetch([
      { match: isEntities("labels|descriptions|claims|sitelinks|info"), body: { entities: { Q5: noArticle } } },
      { match: (u) => u.pathname.startsWith("/api/rest_v1/page/summary/"), body: { type: "disambiguation", title: "Apple", extract: "Apple may refer to:" } },
    ]);
    const r = await getCompanyBackground({ wikidataId: "q5" }, fetcher);
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.matchedBy).toBe("Wikidata id Q5");
    expect(r.company).toMatchObject({ founded: "1925", wikipedia: null, ceo: null, headquarters: [], listings: [] });
  });

  it("surfaces a Wikimedia outage as an error rather than an empty result", async () => {
    const { fetcher } = fakeFetch([{ match: () => true, body: { error: "busy" }, status: 503 }]);
    await expect(getCompanyBackground({ wikidataId: "Q312" }, fetcher)).rejects.toThrow("Wikimedia 503");
  });
});

describe("normalizeName", () => {
  it("ignores legal suffixes, punctuation and ampersands", () => {
    expect(normalizeName("JPMorgan Chase & Co.")).toBe("jpmorgan chase");
    expect(normalizeName("KKR & Co. Inc.")).toBe("kkr");
    expect(normalizeName("The Walt Disney Company")).toBe("walt disney");
    expect(normalizeName("Coca-Cola")).toBe("coca cola");
  });
});
