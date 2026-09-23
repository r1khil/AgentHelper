import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/yahoo", () => ({ getAdjustedBarsRange: vi.fn(), resolveCompany: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: vi.fn() } }));
import { resolveScenarioSnapshot, runBacktest } from "./load";
import { getAdjustedBarsRange, resolveCompany } from "@/lib/providers/yahoo";
import type { Snapshot } from "./engine";
const snapshot: Snapshot = {
  positions: [{ id: "a", ticker: "A", name: "A", weight: 1 }],
  version: "test",
  scope: "test",
  savedWeightTotal: 100,
  capturedAt: "test",
};
beforeEach(() => vi.clearAllMocks());
it("resolves added tickers using the provider and rejects duplicate or unknown symbols", async () => {
  vi.mocked(resolveCompany).mockResolvedValue({ symbol: "IBM", name: "International Business Machines" });
  const scenario = await resolveScenarioSnapshot(snapshot, [" ibm "]);
  expect(resolveCompany).toHaveBeenCalledWith("IBM");
  expect(scenario.positions.at(-1)).toMatchObject({ id: "added:IBM", ticker: "IBM", weight: 0 });
  expect(snapshot.positions).toHaveLength(1);
  await expect(resolveScenarioSnapshot(snapshot, ["A"])).rejects.toThrow(/already/);
  await expect(resolveScenarioSnapshot(snapshot, ["IBM", "ibm"])).rejects.toThrow(/once/);
  vi.mocked(resolveCompany).mockResolvedValue(null);
  await expect(resolveScenarioSnapshot(snapshot, ["XYZ"])).rejects.toThrow(/Could not recognize/);
});
it("reports a provider outage instead of an unknown ticker", async () => {
  vi.mocked(resolveCompany).mockRejectedValue(new Error("429"));
  await expect(resolveScenarioSnapshot(snapshot, ["IBM"])).rejects.toThrow(/unavailable for IBM/);
});
it("loads both portfolio and benchmark on the server with a pre-period baseline", async () => {
  vi.mocked(getAdjustedBarsRange).mockResolvedValue([
    { date: "2025-01-03", close: 100 },
    { date: "2025-01-06", close: 101 },
  ]);
  const r = await runBacktest(
    snapshot,
    { a: 1 },
    "SPY",
    "2025-01-06",
    "2025-01-06",
  );
  expect(r.original.totalReturn).toBeCloseTo(0.01);
  expect(getAdjustedBarsRange).toHaveBeenCalledWith(
    "A",
    "2024-12-23",
    "2025-01-06",
  );
  expect(getAdjustedBarsRange).toHaveBeenCalledWith(
    "SPY",
    "2024-12-23",
    "2025-01-06",
  );
});
it("validates weights and future dates before making provider calls", async () => {
  await expect(
    runBacktest(snapshot, { a: 0.1 }, "SPY", "2025-01-06", "2025-01-07"),
  ).rejects.toThrow(/100%/);
  await expect(
    runBacktest(snapshot, { a: 1 }, "SPY", "2099-01-06", "2099-01-07"),
  ).rejects.toThrow(/before today/);
  expect(getAdjustedBarsRange).not.toHaveBeenCalled();
});
it("reports provider failure without returning a partial replay", async () => {
  vi.mocked(getAdjustedBarsRange).mockRejectedValue(
    new Error("provider failure"),
  );
  await expect(
    runBacktest(snapshot, { a: 1 }, "SPY", "2025-01-06", "2025-01-07"),
  ).rejects.toThrow(/Adjusted history unavailable/);
});
it("keeps cash out of provider calls while using the current unnormalized weights", async () => {
  vi.mocked(getAdjustedBarsRange).mockResolvedValue([
    { date: "2025-01-03", close: 100 },
    { date: "2025-01-06", close: 110 },
  ]);
  const current: Snapshot = {
    ...snapshot,
    positions: [
      { id: "a", ticker: "A", name: "A", weight: 0.8 },
      { id: "cash", ticker: "CASH", name: "Cash", weight: 0.2, kind: "cash" },
    ],
    savedWeightTotal: 80,
  };
  const r = await runBacktest(current, { a: 0.9, cash: 0.1 }, "SPY", "2025-01-06", "2025-01-06");
  expect(r.original.totalReturn).toBeCloseTo(0.08);
  expect(r.modified.totalReturn).toBeCloseTo(0.09);
  expect(getAdjustedBarsRange).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getAdjustedBarsRange).mock.calls.map((c) => c[0])).not.toContain("CASH");
});

import { loadSnapshot } from "./load";
import { db } from "@/db/client";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
it("scopes portfolio reads to the analyst's team and rejects unassigned users", async () => {
  const orderBy = vi
    .fn()
    .mockResolvedValue([
      { id: "a", ticker: "A", companyName: "A", weightPct: "20" },
    ]);
  const where = vi.fn().mockReturnValue({ orderBy });
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where }),
  } as unknown as ReturnType<typeof db.select>);
  const user = {
    role: "associate_analyst",
    teamId: "own-team",
    team: { name: "IT" },
  } as CurrentUser;
  const snapshot = await loadSnapshot(user);
  const query = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
  expect(query.params).toEqual(["active", "own-team"]);
  expect(snapshot.scope).toBe("IT portfolio");
  expect(snapshot.positions[0].weight).toBe(1);
  expect(snapshot.positions[1]).toMatchObject({ ticker: "CASH", weight: 0 });
  expect(snapshot.version).toHaveLength(64);
  await expect(loadSnapshot({ ...user, teamId: null })).rejects.toThrow(
    /Join a team/,
  );
});
it("fund roles read active fund holdings and produce stable, weight-sensitive snapshot versions", async () => {
  const rows = [{ id: "a", ticker: "A", companyName: "A", weightPct: "20" }];
  const orderBy = vi.fn().mockImplementation(() => Promise.resolve(rows));
  const where = vi.fn().mockReturnValue({ orderBy });
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where }),
  } as unknown as ReturnType<typeof db.select>);
  const user = { role: "exec", teamId: null } as CurrentUser;
  const a = await loadSnapshot(user),
    b = await loadSnapshot(user);
  expect(
    new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL).params,
  ).toEqual(["active"]);
  expect(a.version).toBe(b.version);
  expect(a.positions.map((p) => [p.ticker, p.weight])).toEqual([
    ["A", 0.2],
    ["CASH", 0.8],
  ]);
  rows[0].weightPct = "25";
  const updated = await loadSnapshot(user);
  expect(updated.version).not.toBe(a.version);
  expect(updated.positions.map((p) => [p.ticker, p.weight])).toEqual([
    ["A", 0.25],
    ["CASH", 0.75],
  ]);
});
it("fund roles count a ticker covered by two teams once, since weight_pct is the fund-level weight on both rows", async () => {
  const rows = [
    { id: "a1", ticker: "A", companyName: "A", weightPct: "20" },
    { id: "a2", ticker: "A", companyName: "A", weightPct: "20" },
    { id: "b", ticker: "B", companyName: "B", weightPct: "20" },
  ];
  const orderBy = vi.fn().mockImplementation(() => Promise.resolve(rows));
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where: () => ({ orderBy }) }),
  } as unknown as ReturnType<typeof db.select>);
  const snapshot = await loadSnapshot({ role: "exec", teamId: null } as CurrentUser);
  expect(snapshot.positions.map((p) => [p.ticker, p.weight])).toEqual([
    ["A", 0.2],
    ["B", 0.2],
    ["CASH", 0.6],
  ]);
});
