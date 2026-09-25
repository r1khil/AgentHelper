import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { GICS_SECTORS } from "@/lib/attribution/sectors";
import type { Db } from "@/lib/prices";
import { heldEtfs, loadEtfConstituents, refreshEtfConstituents, saveConstituents } from "./store";

// An in-memory Postgres with just what the store touches, plus the real migration 0021.
const MIGRATION = readFileSync(new URL("../../../drizzle/0021_etf_constituents.sql", import.meta.url), "utf8");
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

async function setup(opts: { migrate: boolean }) {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TYPE gics_sector AS ENUM (${GICS_SECTORS.map((s) => `'${s}'`).join(", ")});
    CREATE TYPE trade_side AS ENUM ('buy', 'sell');
    CREATE TABLE trades (ticker text NOT NULL, side trade_side NOT NULL, shares numeric NOT NULL, voided_at timestamptz);
  `);
  if (opts.migrate) for (const statement of MIGRATION.split("--> statement-breakpoint")) await pg.exec(statement);
  return drizzle(pg, { schema }) as unknown as Db;
}

const silent = () => {};
const ok = (body: BodyInit, type = "text/plain") => new Response(body, { status: 200, headers: { "content-type": type } });

/** Serves the fixtures by URL: SSGA gets the SPY file, iShares RING, First Trust CIBR, Roundhill. */
const fixtureFetcher = async (url: string) => {
  if (url.includes("ssga.com")) return ok(new Uint8Array(fixture("ssga-spy.xlsx")), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  if (url.includes("ishares.com")) return ok(fixture("ishares-ring.csv").toString("utf8"), "text/csv");
  if (url.includes("ftportfolios.com")) return ok(fixture("first-trust-cibr.html").toString("utf8"), "text/html");
  if (url.includes("roundhill")) return ok(fixture("roundhill.csv").toString("utf8"), "application/octet-stream");
  return new Response("nope", { status: 404 });
};

describe("refreshEtfConstituents", () => {
  let db: Db;
  beforeEach(async () => {
    db = await setup({ migrate: true });
  });

  it("skips quietly while migration 0021 isn't applied", async () => {
    const bare = await setup({ migrate: false });
    const r = await refreshEtfConstituents(bare, { etfs: ["SPY"], fetcher: fixtureFetcher, log: silent });
    expect(r).toMatchObject({ status: "skipped", refreshed: [] });
    expect(await loadEtfConstituents(bare, ["SPY"])).toEqual([]);
  });

  it("stores each list once and leaves fresh lists alone for a week", async () => {
    const first = await refreshEtfConstituents(db, { etfs: ["SPY", "RING", "CIBR", "DRAM"], today: "2026-09-26", fetcher: fixtureFetcher, log: silent });
    expect(first.status).toBe("ok");
    expect(first.refreshed.map((r) => [r.etf, r.source, r.asOf])).toEqual([
      ["SPY", "ssga", "2026-09-23"],
      ["RING", "ishares", "2026-09-23"],
      ["CIBR", "first-trust", "2026-09-23"],
      ["DRAM", "roundhill", "2026-09-25"],
    ]);
    const lists = await loadEtfConstituents(db, ["SPY", "RING", "CIBR", "DRAM", "SOXX"]);
    expect(lists.map((l) => l.etf).sort()).toEqual(["CIBR", "DRAM", "RING", "SPY"]);
    const dram = lists.find((l) => l.etf === "DRAM")!;
    expect(dram.constituents[0]).toMatchObject({ symbol: "MU", weight: 26.79 });
    expect(lists.find((l) => l.etf === "RING")!.constituents.every((c) => c.sector === "materials")).toBe(true);

    const again = await refreshEtfConstituents(db, { etfs: ["SPY", "RING"], today: "2026-09-30", fetcher: fixtureFetcher, log: silent });
    expect(again.fresh).toEqual(["SPY", "RING"]);
    expect(again.refreshed).toEqual([]);

    const later = await refreshEtfConstituents(db, { etfs: ["SPY"], today: "2026-10-01", fetcher: fixtureFetcher, log: silent });
    expect(later.refreshed.map((r) => r.etf)).toEqual(["SPY"]);
    const spyRows = (await loadEtfConstituents(db, ["SPY"]))[0].constituents.length;
    expect(spyRows).toBe(first.refreshed[0].rows); // Replaced, not duplicated.
  });

  const blocked = async () => new Response("blocked", { status: 403 });
  const yahooTop = async () => [
    { symbol: "NVDA", name: "NVIDIA", weightPct: 8 },
    { symbol: "AAPL", name: "Apple", weightPct: 7 },
    { symbol: "MSFT", name: "Microsoft", weightPct: 6 },
  ];

  it("keeps a recent issuer list rather than replace it with Yahoo's top 10", async () => {
    await refreshEtfConstituents(db, { etfs: ["SPY"], today: "2026-09-24", fetcher: fixtureFetcher, log: silent });
    const r = await refreshEtfConstituents(db, { etfs: ["SPY"], today: "2026-10-05", fetcher: blocked, topHoldings: yahooTop, log: silent });
    expect(r).toMatchObject({ status: "ok", kept: ["SPY"], refreshed: [] });
    expect((await loadEtfConstituents(db, ["SPY"]))[0]).toMatchObject({ source: "ssga", asOf: "2026-09-23" });
  });

  it("stores Yahoo's top 10, with the issuer's error, when there is no recent full list", async () => {
    const r = await refreshEtfConstituents(db, { etfs: ["KRE"], today: "2026-09-26", fetcher: blocked, topHoldings: yahooTop, log: silent });
    expect(r.refreshed).toEqual([{ etf: "KRE", asOf: "2026-09-26", source: "yahoo-top10", rows: 3, coveragePct: 21, issuerError: "HTTP 403 from www.ssga.com" }]);
  });

  it("records a failure without throwing", async () => {
    const none = async () => [];
    const r = await refreshEtfConstituents(db, { etfs: ["DRAM"], today: "2026-09-26", fetcher: async () => ok("<!doctype html>", "text/html"), topHoldings: none, log: silent });
    expect(r.status).toBe("failed");
    expect(r.failed.DRAM).toMatch(/no Roundhill holdings file in the last ten days.*Yahoo has no top holdings/);
  });

  it("dry-runs without writing", async () => {
    const r = await refreshEtfConstituents(db, { etfs: ["CIBR"], today: "2026-09-26", fetcher: fixtureFetcher, write: false, log: silent });
    expect(r.refreshed[0]).toMatchObject({ etf: "CIBR", source: "first-trust" });
    expect(await loadEtfConstituents(db, ["CIBR"])).toEqual([]);
  });

  it("finds held ETFs from the ledger", async () => {
    await saveConstituents(db, { etf: "X", asOf: "2026-09-23", source: "ssga", constituents: [{ symbol: "A", name: "A", weight: 1, sector: null }], dropped: [] });
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`insert into trades (ticker, side, shares, voided_at) values
      ('SOXX', 'buy', 100, null), ('SOXX', 'sell', 40, null),
      ('KRE', 'buy', 50, null), ('KRE', 'sell', 50, null),
      ('XLF', 'buy', 10, now()),
      ('NVDA', 'buy', 5, null)`);
    expect(await heldEtfs(db)).toEqual(["SOXX"]);
  });
});
