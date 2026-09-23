import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/backtesting/load", () => ({
  loadSnapshot: vi.fn(),
  resolveScenarioSnapshot: vi.fn(),
  runBacktest: vi.fn(),
}));
import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { loadSnapshot, resolveScenarioSnapshot, runBacktest } from "@/lib/backtesting/load";
const id = "00000000-0000-4000-8000-000000000001";
const body = {
  from: "2025-01-06",
  to: "2025-01-07",
  benchmark: "SPY",
  version: "a".repeat(64),
  weights: { [id]: 1 },
};
const request = (input: unknown = body) =>
  new Request("http://localhost/api/backtesting", {
    method: "POST",
    body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    id,
    role: "associate_analyst",
    teamId: "own-team",
    onboardedAt: new Date(),
  } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(loadSnapshot).mockResolvedValue({
    positions: [],
    version: body.version,
    scope: "own team",
    capturedAt: "test",
    savedWeightTotal: 100,
  });
});
it("requires authentication before loading holdings or fetching prices", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(loadSnapshot).not.toHaveBeenCalled();
  expect(runBacktest).not.toHaveBeenCalled();
});
it("does not accept a caller-selected team, baseline or arbitrary benchmark", async () => {
  for (const bad of [
    { ...body, teamId: "other" },
    { ...body, original: {} },
    { ...body, benchmark: "https://evil.test" },
    { ...body, weights: { [id]: -1 } },
  ])
    expect((await POST(request(bad))).status).toBe(400);
  expect(runBacktest).not.toHaveBeenCalled();
});
it("rejects stale snapshots", async () => {
  const r = await POST(request({ ...body, version: "b".repeat(64) }));
  expect(r.status).toBe(409);
  expect(runBacktest).not.toHaveBeenCalled();
});
it("passes the authenticated user's current snapshot and disables response caching", async () => {
  vi.mocked(runBacktest).mockResolvedValue({ days: [] } as unknown as Awaited<
    ReturnType<typeof runBacktest>
  >);
  const r = await POST(request());
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(loadSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ teamId: "own-team" }),
  );
  expect(runBacktest).toHaveBeenCalledWith(
    expect.objectContaining({ scope: "own team" }),
    body.weights,
    "SPY",
    body.from,
    body.to,
  );
});
it("resolves scenario-only companies before replaying and accepts their IDs in weights", async () => {
  const added = { id: "added:IBM", ticker: "IBM", name: "IBM", weight: 0, kind: "scenario" as const };
  vi.mocked(resolveScenarioSnapshot).mockResolvedValue({
    positions: [added], version: body.version, scope: "own team", capturedAt: "test", savedWeightTotal: 100,
  });
  vi.mocked(runBacktest).mockResolvedValue({ days: [] } as unknown as Awaited<ReturnType<typeof runBacktest>>);
  const weights = { [id]: 0.8, [added.id]: 0.2 };
  const r = await POST(request({ ...body, weights, addedTickers: ["IBM"] }));
  expect(r.status).toBe(200);
  expect(resolveScenarioSnapshot).toHaveBeenCalledWith(expect.objectContaining({ version: body.version }), ["IBM"]);
  expect(runBacktest).toHaveBeenCalledWith(expect.objectContaining({ positions: [added] }), weights, "SPY", body.from, body.to);
});
it("handles malformed JSON", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost/api/backtesting", {
          method: "POST",
          body: "not json",
        }),
      )
    ).status,
  ).toBe(400);
});
