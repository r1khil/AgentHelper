import type { ScreenCheckpoint } from "@/db/schema";
import type { GicsSector } from "@/lib/attribution/sectors";
import { frameId, type CompanyProfile, type FrameRequest, type FrameRow, type ListedCompany } from "@/lib/providers/edgar-frames";
import { buildFramesPlan, compactFrame, framesFiscalYears, HISTORY_YEARS, mergeFrames, type SavedFrame } from "./frames-plan";
import { adjustForSplits, deriveYear, lineItemCoverage, type DerivedYear } from "./line-items";
import { computeScreenMetrics, type ScreenResult } from "./metrics";
import { priceAtYearEnd, yahooSymbol, type BulkPriceSource, type PriceHistory } from "./prices";
import { metricCoverage, rankedMetrics, rankScreen, type Ranked } from "./ranking";
import { exclusionReason, notScreenedReason, sicToGics } from "./sic";

/*
 * The monthly screen as a resumable job. Hundreds of sequential SEC and Yahoo requests take far longer than one
 * function call may run, so each call advances the run from its checkpoint until its time budget is spent, saving the
 * checkpoint after every frame and every batch of prices. pg_cron calls again every ten minutes on weekends.
 *
 *   universe  NYSE and Nasdaq companies (SEC's ticker file), with today's market cap from Yahoo; kept above $3B.
 *   frames    one XBRL frame per concept and period, each saved as a small Storage object (CIK, value, period end).
 *   prices    per company: SIC code and annual form from SEC (exclusions, ADRs, sector), then month-end closes.
 *   rank      merge the saved objects, compute metrics and coverage, rank, and hand back the hits.
 *
 * A call loads only the checkpoint and the universe; earlier frames' data is read back only by the rank stage. The
 * data sources and Storage come in through ScreenDeps, so this file is tested without a network or a database.
 */

export const MIN_MARKET_CAP = 3e9;
const QUOTE_BATCH = 100;
const PRICE_BATCH = 20;
/** Leave this much of the budget unused: a frame or a price batch can take several seconds. */
const BUDGET_MARGIN_MS = 15_000;

export type JsonStore = {
  put(path: string, value: unknown): Promise<void>;
  get<T>(path: string): Promise<T | null>;
  list(prefix: string): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
};

export type ScreenLog = { step(name: string, detail?: Record<string, unknown>): void; warn(name: string, detail?: Record<string, unknown>): void };

export type ScreenDeps = {
  listCompanies(): Promise<ListedCompany[]>;
  fetchFrame(req: FrameRequest): Promise<FrameRow[]>;
  profile(cik: string): Promise<CompanyProfile | null>;
  prices: BulkPriceSource;
  store: JsonStore;
  /** GICS sector → the team that covers it. */
  teamsBySector(): Promise<Partial<Record<GicsSector, string>>>;
  saveCheckpoint(c: ScreenCheckpoint): Promise<void>;
  log: ScreenLog;
  now(): number;
};

export type UniverseCompany = ListedCompany & { price: number; marketCap: number };
export type Universe = { asOf: string; companies: UniverseCompany[]; counts: { listed: number; quoted: number; aboveFloor: number } };

/** What the prices stage learns about each company. */
export type PriceEntry = {
  sic: string | null;
  sicDescription: string | null;
  annualForm: string | null;
  excluded?: string;
  notScreened?: string;
  prices?: PriceHistory | null;
};
type PriceBatch = { entries: Record<string, PriceEntry> };

export type ScreenedName = {
  cik: string;
  ticker: string;
  name: string;
  sic: string | null;
  sector: GicsSector | null;
  teamId: string | null;
  price: number;
  marketCap: number;
  periodEnd: string | null;
  accessions: string[];
  result: ScreenResult;
};

export type ScreenHitDraft = Omit<ScreenedName, "result"> & { track: "value" | "garp"; rank: number; teamRank: number | null; metrics: Record<string, number | null> };

export type RankOutcome = {
  hits: ScreenHitDraft[];
  /** Metric key → share of the screened universe whose inputs resolved (screen_runs.coverage). */
  coverage: Record<string, number>;
  universeSize: number;
  params: Record<string, unknown>;
};

export type AdvanceResult = { checkpoint: ScreenCheckpoint; outcome?: RankOutcome };

const paths = (root: string) => ({
  universe: `${root}/universe.json`,
  frame: (id: string) => `${root}/frames/${id.replace(/[/:]/g, "_")}.json`,
  frames: `${root}/frames`,
  prices: (batch: number) => `${root}/prices/${String(batch).padStart(4, "0")}.json`,
  pricesDir: `${root}/prices`,
  results: `${root}/results.json`,
});

/** Advance a run from its checkpoint until the stage list is finished or the budget is spent. */
export async function advanceScreen(run: { runDate: string; storagePath: string; checkpoint: ScreenCheckpoint }, deps: ScreenDeps, budgetMs: number): Promise<AdvanceResult> {
  const started = deps.now();
  const left = () => budgetMs - (deps.now() - started) > BUDGET_MARGIN_MS;
  const p = paths(run.storagePath);
  let cp: ScreenCheckpoint = { ...run.checkpoint, conceptsDone: [...run.checkpoint.conceptsDone] };
  const save = async (next: ScreenCheckpoint) => {
    cp = next;
    await deps.saveCheckpoint(cp);
  };

  if (cp.stage === "universe") {
    const universe = await buildUniverse(deps, run.runDate);
    await deps.store.put(p.universe, universe);
    deps.log.step("universe", universe.counts);
    await save({ ...cp, stage: "frames" });
  }

  let universe: Universe | null = null;
  const loadUniverse = async () => {
    universe ??= await deps.store.get<Universe>(p.universe);
    if (!universe) throw new Error("The run's universe file is missing from Storage");
    return universe;
  };

  if (cp.stage === "frames") {
    const plan = buildFramesPlan(run.runDate);
    const keep = new Set((await loadUniverse()).companies.map((c) => Number(c.cik)));
    const done = new Set(cp.conceptsDone);
    for (const req of plan) {
      const id = frameId(req);
      if (done.has(id)) continue;
      if (!left()) return { checkpoint: cp };
      const rows = await deps.fetchFrame(req);
      await deps.store.put(p.frame(id), compactFrame(req, rows, keep));
      await save({ ...cp, conceptsDone: [...cp.conceptsDone, id] });
    }
    deps.log.step("frames", { requests: plan.length });
    await save({ ...cp, stage: "prices" });
  }

  if (cp.stage === "prices") {
    const { companies } = await loadUniverse();
    const from = `${Number(run.runDate.slice(0, 4)) - HISTORY_YEARS - 1}-01-01`;
    while (cp.pricesDone < companies.length) {
      if (!left()) return { checkpoint: cp };
      const batch = companies.slice(cp.pricesDone, cp.pricesDone + PRICE_BATCH);
      const entries: Record<string, PriceEntry> = {};
      for (const c of batch) entries[c.cik] = await priceEntry(c, deps, from);
      await deps.store.put(p.prices(Math.floor(cp.pricesDone / PRICE_BATCH)), { entries } satisfies PriceBatch);
      await save({ ...cp, pricesDone: cp.pricesDone + batch.length });
    }
    deps.log.step("prices", { companies: companies.length });
    await save({ ...cp, stage: "rank" });
  }

  if (cp.stage === "rank") {
    const outcome = await rankStage(run, deps, await loadUniverse());
    await deps.store.put(p.results, outcome);
    // The per-frame objects are only working sets; the merged results stay.
    const stale = await deps.store.list(p.frames);
    if (stale.length) await deps.store.remove(stale);
    deps.log.step("rank", { hits: outcome.hits.length, universe: outcome.universeSize });
    await save({ ...cp, stage: "done" });
    return { checkpoint: cp, outcome };
  }
  // Ranked on an earlier call whose hits never landed (the write failed or the function was killed): hand the saved
  // outcome back so the caller can finish the run instead of leaving it running forever.
  if (cp.stage === "done") {
    const saved = await deps.store.get<RankOutcome>(p.results);
    if (!saved) throw new Error("The run's results file is missing from Storage");
    return { checkpoint: cp, outcome: saved };
  }
  return { checkpoint: cp };
}

async function buildUniverse(deps: ScreenDeps, runDate: string): Promise<Universe> {
  const listed = await deps.listCompanies();
  const quotes: Record<string, Awaited<ReturnType<BulkPriceSource["quotes"]>>[string]> = {};
  for (let i = 0; i < listed.length; i += QUOTE_BATCH) Object.assign(quotes, await deps.prices.quotes(listed.slice(i, i + QUOTE_BATCH).map((c) => yahooSymbol(c.ticker))));
  const companies: UniverseCompany[] = [];
  for (const c of listed) {
    const q = quotes[yahooSymbol(c.ticker)];
    if (!q || q.marketCap === null || q.marketCap <= MIN_MARKET_CAP) continue;
    if (q.currency && q.currency !== "USD") continue;
    if (q.quoteType && q.quoteType !== "EQUITY") continue;
    companies.push({ ...c, price: q.price, marketCap: q.marketCap });
  }
  return { asOf: runDate, companies, counts: { listed: listed.length, quoted: Object.keys(quotes).length, aboveFloor: companies.length } };
}

async function priceEntry(c: UniverseCompany, deps: ScreenDeps, from: string): Promise<PriceEntry> {
  let profile: CompanyProfile | null = null;
  try {
    profile = await deps.profile(c.cik);
  } catch (e) {
    deps.log.warn("profile failed", { ticker: c.ticker, error: e instanceof Error ? e.message : String(e) });
  }
  const base = { sic: profile?.sic ?? null, sicDescription: profile?.sicDescription ?? null, annualForm: profile?.annualForm ?? null };
  if (!profile) return { ...base, notScreened: "SEC profile unavailable" };
  const excluded = exclusionReason({ sic: profile.sic, name: profile.name || c.name });
  if (excluded) return { ...base, excluded };
  const notScreened = notScreenedReason(profile.annualForm);
  if (notScreened) return { ...base, notScreened };
  try {
    return { ...base, prices: await deps.prices.monthEndCloses(yahooSymbol(c.ticker), from) };
  } catch (e) {
    deps.log.warn("prices failed", { ticker: c.ticker, error: e instanceof Error ? e.message : String(e) });
    return { ...base, prices: null };
  }
}

/** Read every saved object back (a few at a time) and rank. */
async function rankStage(run: { runDate: string; storagePath: string }, deps: ScreenDeps, universe: Universe): Promise<RankOutcome> {
  const p = paths(run.storagePath);
  const framePaths = await deps.store.list(p.frames);
  const pricePaths = await deps.store.list(p.pricesDir);
  const frames = (await readAll<SavedFrame>(deps.store, framePaths)).filter((f): f is SavedFrame => Boolean(f));
  const entries: Record<string, PriceEntry> = {};
  for (const b of await readAll<PriceBatch>(deps.store, pricePaths)) Object.assign(entries, b?.entries ?? {});
  const teams = await deps.teamsBySector();
  return rankUniverse(universe, frames, entries, teams, run.runDate);
}

async function readAll<T>(store: JsonStore, list: string[], concurrency = 8): Promise<(T | null)[]> {
  const out: (T | null)[] = new Array(list.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await store.get<T>(list[i]);
      }
    }),
  );
  return out;
}

/** The rank stage's pure core: merged frames and price entries in, hits and coverage out. */
export function rankUniverse(universe: Universe, frames: SavedFrame[], entries: Record<string, PriceEntry>, teams: Partial<Record<GicsSector, string>>, runDate: string): RankOutcome {
  const merged = mergeFrames(frames);
  const screened: ScreenedName[] = [];
  const excluded: Record<string, number> = {};
  const notScreened: { ticker: string; name: string; reason: string }[] = [];
  const latest: (DerivedYear | null)[] = [];
  for (const c of universe.companies) {
    const e = entries[c.cik];
    if (!e) {
      notScreened.push({ ticker: c.ticker, name: c.name, reason: "Not reached by the prices stage" });
      continue;
    }
    if (e.excluded) {
      excluded[e.excluded] = (excluded[e.excluded] ?? 0) + 1;
      continue;
    }
    if (e.notScreened) {
      notScreened.push({ ticker: c.ticker, name: c.name, reason: e.notScreened });
      continue;
    }
    const years = adjustForSplits(framesFiscalYears(merged, Number(c.cik)).map(deriveYear), e.prices?.splits.map((s) => s.ratio));
    latest.push(years[0] ?? null);
    if (!years.length) {
      notScreened.push({ ticker: c.ticker, name: c.name, reason: "No annual US GAAP figures in SEC frames" });
      continue;
    }
    const yearEndPrices = years.map((y) => priceAtYearEnd(e.prices?.closes, y.end));
    const result = computeScreenMetrics({ years, yearEndPrices, price: c.price, marketCap: c.marketCap });
    const sector = sicToGics(e.sic);
    screened.push({ cik: c.cik, ticker: c.ticker, name: c.name, sic: e.sic, sector, teamId: sector ? (teams[sector] ?? null) : null, price: c.price, marketCap: c.marketCap, periodEnd: years[0].end, accessions: years[0].accessions, result });
  }
  // Companies with no annual figures at all count against line-item coverage too.
  const itemCoverage = lineItemCoverage(latest);
  const metricCov = metricCoverage(screened.map((s) => s.result));
  const coverage: Record<string, number> = { ...metricCov };

  const ranked: Ranked[] = rankScreen(screened.map((s) => ({ key: s.cik, ticker: s.ticker, teamId: s.teamId, result: s.result })), metricCov);
  const byCik = new Map(screened.map((s) => [s.cik, s]));
  const hits: ScreenHitDraft[] = ranked.map((r) => {
    const { result, ...s } = byCik.get(r.key)!;
    return { ...s, track: r.track, rank: r.rank, teamRank: r.teamRank, metrics: { ...result.metrics, composite: r.composite } };
  });
  return {
    hits,
    coverage,
    universeSize: screened.length,
    params: {
      runDate,
      minMarketCap: MIN_MARKET_CAP,
      counts: { ...universe.counts, screened: screened.length, ranked: ranked.length, excluded: Object.values(excluded).reduce((a, b) => a + b, 0), notScreened: notScreened.length },
      excluded,
      /** How many listed names weren't screened (ADRs, no US GAAP figures), and which. */
      notScreened: notScreened.length,
      notScreenedList: notScreened,
      /** Share of the screened universe whose latest year resolves each line item (the prerequisite-1 report). */
      itemCoverage,
      rankedMetrics: { value: rankedMetrics(metricCov, "value"), garp: rankedMetrics(metricCov, "garp") },
    },
  };
}
