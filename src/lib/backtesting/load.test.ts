import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/yahoo", () => ({ getAdjustedBarsRange: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth", () => ({
  isFundWide: (u: { role: string }) => ["admin", "exec"].includes(u.role),
}));
import { runBacktest } from "./load";
import { getAdjustedBarsRange } from "@/lib/providers/yahoo";
import type { Snapshot } from "./engine";
const snapshot: Snapshot = {
  positions: [{ id: "a", ticker: "A", name: "A", weight: 1 }],
  version: "test",
  scope: "test",
  savedWeightTotal: 100,
  capturedAt: "test",
};
beforeEach(() => vi.clearAllMocks());
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
  expect(snapshot.scope).toBe("IT invested holdings");
  expect(snapshot.positions[0].weight).toBe(1);
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
  rows[0].weightPct = "25";
  expect((await loadSnapshot(user)).version).not.toBe(a.version);
});
