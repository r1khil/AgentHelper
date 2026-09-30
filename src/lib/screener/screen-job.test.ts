import { describe, expect, it } from "vitest";
import type { ScreenCheckpoint } from "@/db/schema";
import { frameId, type CompanyProfile, type FrameRequest, type FrameRow } from "@/lib/providers/edgar-frames";
import { buildFramesPlan } from "./frames-plan";
import type { BulkPriceSource } from "./prices";
import { advanceScreen, type JsonStore, type ScreenDeps } from "./screen-job";

const RUN_DATE = "2026-10-03";

/** Two healthy operating companies (tech and staples) with seven years of figures, plus names the screen skips. */
const companies = [
  { cik: "0000000001", name: "Tech Co", ticker: "TECH", exchange: "Nasdaq" },
  { cik: "0000000002", name: "Soda Co", ticker: "SODA", exchange: "NYSE" },
  { cik: "0000000003", name: "Bank Co", ticker: "BANK", exchange: "NYSE" },
  { cik: "0000000004", name: "Foreign Co", ticker: "ADR", exchange: "NYSE" },
  { cik: "0000000005", name: "Tiny Co", ticker: "TINY", exchange: "Nasdaq" },
];
const profiles: Record<string, Partial<CompanyProfile>> = {
  "0000000001": { sic: "7372", annualForm: "10-K" },
  "0000000002": { sic: "2086", annualForm: "10-K" },
  "0000000003": { sic: "6022", annualForm: "10-K" },
  "0000000004": { sic: "3674", annualForm: "20-F" },
  "0000000005": { sic: "3571", annualForm: "10-K" },
};

/** Figures per company per calendar year: tech grows 10% a year, staples 3%. */
function figure(cik: number, concept: string, year: number): number | null {
  const g = cik === 1 ? 1.1 : 1.03;
  const k = g ** (year - 2019);
  const base: Record<string, number> = {
    Revenues: 1000,
    OperatingIncomeLoss: 250,
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 240,
    IncomeTaxExpenseBenefit: 48,
    NetIncomeLoss: 192,
    EarningsPerShareDiluted: 1.92,
    NetCashProvidedByUsedInOperatingActivities: 260,
    WeightedAverageNumberOfDilutedSharesOutstanding: 100,
    PaymentsToAcquirePropertyPlantAndEquipment: 60,
    DepreciationDepletionAndAmortization: 50,
    GrossProfit: 500,
    Assets: 2000,
    AssetsCurrent: 700,
    LiabilitiesCurrent: 400,
    CashAndCashEquivalentsAtCarryingValue: 200,
    StockholdersEquity: 900,
    LongTermDebt: 400,
    Liabilities: 1100,
    RetainedEarnings: 600,
    RetainedEarningsAccumulatedDeficit: 600,
  };
  if (!(concept in base)) return null;
  // Shares shrink 2% a year; everything else scales with the company.
  if (concept === "WeightedAverageNumberOfDilutedSharesOutstanding") return 100 * 0.98 ** (year - 2019);
  return base[concept] * k;
}

function fakeFrame(req: FrameRequest): FrameRow[] {
  const m = req.period.match(/^CY(\d{4})(Q4I)?$/);
  if (!m) return [];
  const year = Number(m[1]);
  if (year > 2025 || year < 2019) return [];
  const rows: FrameRow[] = [];
  for (const cik of [1, 2, 3, 4, 5]) {
    const val = figure(cik, req.concept, year);
    if (val === null) continue;
    rows.push(m[2] ? { cik, val, end: `${year}-12-31`, accn: `acc-${cik}-${year}` } : { cik, val, start: `${year}-01-01`, end: `${year}-12-31`, accn: `acc-${cik}-${year}` });
  }
  return rows;
}

function harness() {
  const mem = new Map<string, unknown>();
  const store: JsonStore = {
    put: async (p, v) => void mem.set(p, JSON.parse(JSON.stringify(v))),
    get: async <T,>(p: string) => (mem.get(p) as T) ?? null,
    list: async (prefix) => [...mem.keys()].filter((k) => k.startsWith(`${prefix}/`)).sort(),
    remove: async (ps) => ps.forEach((p) => mem.delete(p)),
  };
  let clock = 0;
  const fetched: string[] = [];
  let checkpoint: ScreenCheckpoint = { conceptsDone: [], pricesDone: 0, stage: "universe" };
  const prices: BulkPriceSource = {
    name: "fake",
    quotes: async (symbols) => Object.fromEntries(symbols.map((s) => [s, { price: 50, marketCap: s === "TINY" ? 1e9 : 5e9, currency: "USD", quoteType: "EQUITY" }])),
    monthEndCloses: async () => ({ closes: Object.fromEntries([2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => [`${y}-12`, 20 + (y - 2019) * 2])), splits: [] }),
  };
  const deps: ScreenDeps = {
    listCompanies: async () => companies,
    fetchFrame: async (req) => {
      fetched.push(frameId(req));
      clock += 1000;
      return fakeFrame(req);
    },
    profile: async (cik) => ({ cik, name: companies.find((c) => c.cik === cik)!.name, sic: null, sicDescription: null, fiscalYearEnd: "1231", annualForm: null, ...profiles[cik] }),
    prices,
    store,
    teamsBySector: async () => ({ information_technology: "team-tech" }),
    saveCheckpoint: async (c) => void (checkpoint = c),
    log: { step: () => {}, warn: () => {} },
    now: () => clock,
  };
  return { deps, mem, fetched, get checkpoint() { return checkpoint; } };
}

describe("advanceScreen", () => {
  it("stops when the budget runs out and resumes from the checkpoint without refetching", async () => {
    const h = harness();
    const run = { runDate: RUN_DATE, storagePath: "runs/t", checkpoint: h.checkpoint };
    const first = await advanceScreen(run, h.deps, 20_000);
    expect(first.outcome).toBeUndefined();
    expect(first.checkpoint.stage).toBe("frames");
    expect(first.checkpoint.conceptsDone.length).toBe(h.fetched.length);
    expect(h.fetched.length).toBeGreaterThan(0);
    expect(h.checkpoint).toEqual(first.checkpoint);
    // The universe is saved once and kept to companies above $3B.
    const universe = h.mem.get("runs/t/universe.json") as { companies: { ticker: string }[] };
    expect(universe.companies.map((c) => c.ticker)).toEqual(["TECH", "SODA", "BANK", "ADR"]);

    let cp = first.checkpoint;
    let outcome;
    for (let i = 0; i < 200 && !outcome; i++) {
      const r = await advanceScreen({ ...run, checkpoint: cp }, h.deps, 20_000);
      cp = r.checkpoint;
      outcome = r.outcome;
    }
    expect(cp.stage).toBe("done");
    expect(new Set(h.fetched).size).toBe(h.fetched.length);
    expect(h.fetched.length).toBe(buildFramesPlan(RUN_DATE).length);
    expect(cp.pricesDone).toBe(4);

    expect(outcome!.universeSize).toBe(2);
    expect(outcome!.hits.map((x) => x.ticker).sort()).toEqual(["SODA", "TECH"]);
    const tech = outcome!.hits.find((x) => x.ticker === "TECH")!;
    expect(tech).toMatchObject({ sector: "information_technology", teamId: "team-tech", periodEnd: "2025-12-31", price: 50, marketCap: 5e9, sic: "7372" });
    expect(tech.teamRank).toBe(1);
    expect(tech.accessions).toContain("acc-1-2025");
    expect(tech.metrics.roic).toBeGreaterThan(0);
    expect(tech.metrics.shareChange3y).toBeCloseTo(0.98 ** 3 - 1, 3);
    expect(outcome!.hits.find((x) => x.ticker === "SODA")!.teamId).toBeNull();
    expect(outcome!.params).toMatchObject({ excluded: { "Bank or lender": 1 }, notScreened: 1, notScreenedList: [{ ticker: "ADR" }] });
    expect(outcome!.coverage.evEbit).toBe(1);
    expect(Object.keys(outcome!.coverage).every((k) => !k.startsWith("item."))).toBe(true);
    expect((outcome!.params.itemCoverage as Record<string, number>).revenue).toBe(1);
    // Working sets are cleaned up; the merged results stay.
    expect([...h.mem.keys()].some((k) => k.includes("/frames/"))).toBe(false);
    expect(h.mem.has("runs/t/results.json")).toBe(true);
  });

  it("does nothing more once done", async () => {
    const h = harness();
    const r = await advanceScreen({ runDate: RUN_DATE, storagePath: "runs/t", checkpoint: { conceptsDone: [], pricesDone: 0, stage: "done" } }, h.deps, 60_000);
    expect(r).toEqual({ checkpoint: { conceptsDone: [], pricesDone: 0, stage: "done" } });
    expect(h.fetched).toEqual([]);
  });

  it("fails loudly when the universe file is missing mid-run", async () => {
    const h = harness();
    await expect(advanceScreen({ runDate: RUN_DATE, storagePath: "runs/t", checkpoint: { conceptsDone: [], pricesDone: 0, stage: "frames" } }, h.deps, 60_000)).rejects.toThrow(/universe file is missing/);
  });
});
