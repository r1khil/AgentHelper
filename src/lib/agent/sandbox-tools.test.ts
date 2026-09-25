import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/sandbox/datasets", () => ({ DATASET_RANGES: ["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "itd"], loadDataset: vi.fn() }));
vi.mock("@/lib/sandbox/python", () => ({ runPython: vi.fn(), sandboxAvailable: vi.fn(() => false) }));
vi.mock("@/lib/sandbox/quota", () => ({ countSandboxRun: vi.fn(), DAILY_RUN_LIMIT: 30, nyDay: () => "2026-09-25" }));

import type { CurrentUser } from "@/lib/auth";
import type { Dataset } from "@/lib/sandbox/datasets";
import type { PythonRun } from "@/lib/sandbox/python";
import { sandboxAvailable } from "@/lib/sandbox/python";
import type { ToolResult } from "./tools";
import { computationSource, makeSandboxTools, type SandboxToolDeps } from "./sandbox-tools";

const viewer = { id: "user-1", role: "analyst", teamId: "team-fin", team: null } as unknown as CurrentUser;
const ctx = { viewer, teamId: "team-fin" };

const dataset = (name: string, id: string): Dataset => ({
  name,
  path: `data/${name.replace(":", "_")}.csv`,
  columns: ["date", "close"],
  rows: 2,
  firstDate: "2026-09-23",
  lastDate: "2026-09-24",
  content: "date,close\n2026-09-23,1\n2026-09-24,2\n",
  source: { id, title: `${name} source`, publisher: "Yahoo Finance", retrievedAt: "2026-09-25T00:00:00Z" },
});
const ok = (stdout: string): PythonRun => ({ exitCode: 0, timedOut: false, stdout, stderr: "", durationMs: 900, coldStart: false });

function setup(over: Partial<SandboxToolDeps> = {}) {
  const deps = {
    run: vi.fn(async () => ok("Correlation: 0.61\n")),
    load: vi.fn(async (req: { name: string }) => dataset(req.name, `yh-${req.name.split(":")[1]?.toLowerCase() ?? "x"}`)),
    countRun: vi.fn(async () => 1),
    ...over,
  };
  const tools = makeSandboxTools(ctx, deps);
  const call = (input: unknown) => (tools.run_python!.execute as (i: unknown, o: unknown) => Promise<ToolResult<Record<string, unknown> | null>>)(input, { toolCallId: "t", messages: [] });
  return { deps, call };
}

afterEach(() => vi.mocked(sandboxAvailable).mockReturnValue(false));

describe("makeSandboxTools", () => {
  it("adds nothing without sandbox credentials", () => {
    expect(makeSandboxTools(ctx)).toEqual({});
  });

  it("adds run_python when credentials exist", () => {
    vi.mocked(sandboxAvailable).mockReturnValue(true);
    expect(Object.keys(makeSandboxTools(ctx))).toEqual(["run_python"]);
  });

  it("writes the datasets, runs the code and returns a Computation source that cites its inputs", async () => {
    const { deps, call } = setup();
    const code = "import pandas as pd\nprint('Correlation: 0.61')";
    const r = await call({ code, datasets: [{ name: "prices:AXP" }, { name: "prices:SPY", range: "2y" }, { name: "prices:AXP" }] });

    expect(r.error).toBeUndefined();
    expect(deps.load).toHaveBeenCalledWith({ name: "prices:SPY", range: "2y" });
    expect(deps.run).toHaveBeenCalledWith({ code, files: [{ path: "data/prices_AXP.csv", content: expect.any(String) }, { path: "data/prices_SPY.csv", content: expect.any(String) }] });
    expect(deps.countRun).toHaveBeenCalledWith("user-1");
    expect(r.sources.map((s) => s.id)).toEqual(["yh-axp", "yh-spy", r.data!.sourceId]);
    const calc = r.sources[2];
    expect(calc).toMatchObject({ sourceType: "Computation", publishedAt: "2026-09-25" });
    expect(calc.id).toMatch(/^calc-/);
    expect(calc.excerpt).toContain("[yh-axp]");
    expect(calc.excerpt).toContain("[yh-spy]");
    expect(calc.excerpt).toContain("Correlation: 0.61");
    expect(calc.excerpt).toContain(code);
    expect(r.data).toMatchObject({ exitCode: 0, stdout: "Correlation: 0.61\n", runsLeftToday: 29 });
    expect((r.data!.files as { path: string; sourceId: string }[]).map((f) => [f.path, f.sourceId])).toEqual([["data/prices_AXP.csv", "yh-axp"], ["data/prices_SPY.csv", "yh-spy"]]);
  });

  it("runs without datasets", async () => {
    const { call } = setup();
    const r = await call({ code: "print(2**10)" });
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].excerpt).toContain("Inputs: none");
  });

  it("stops at the daily limit without starting a sandbox", async () => {
    const { deps, call } = setup({ countRun: vi.fn(async () => 31) });
    const r = await call({ code: "print(1)", datasets: [{ name: "prices:AXP" }] });
    expect(r.error).toContain("Daily limit reached: 30");
    expect(deps.run).not.toHaveBeenCalled();
    expect(r.sources.map((s) => s.id)).toEqual(["yh-axp"]);
  });

  it("returns the traceback and no Computation source when Python fails", async () => {
    const { call } = setup({ run: vi.fn(async () => ({ ...ok(""), exitCode: 1, stderr: 'Traceback (most recent call last):\n  File "main.py", line 1\nKeyError: \'adj_close\'' })) });
    const r = await call({ code: "x", datasets: [{ name: "prices:AXP" }] });
    expect(r.error).toContain("KeyError: 'adj_close'");
    expect(r.data).toMatchObject({ exitCode: 1 });
    expect(r.sources.some((s) => s.sourceType === "Computation")).toBe(false);
  });

  it("explains a timeout", async () => {
    const { call } = setup({ run: vi.fn(async () => ({ ...ok("partial"), exitCode: 137, timedOut: true })) });
    const r = await call({ code: "while True: pass" });
    expect(r.error).toContain("60-second limit");
  });

  it("reports a dataset the member cannot load without running anything", async () => {
    const { deps, call } = setup({ load: vi.fn(async () => { throw new Error("Whole-fund returns are visible to execs and admins only; use returns:team."); }) });
    const r = await call({ code: "print(1)", datasets: [{ name: "returns:fund" }] });
    expect(r).toMatchObject({ data: null, error: expect.stringContaining("execs and admins only") });
    expect(deps.countRun).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("surfaces sandbox failures as tool errors", async () => {
    const { call } = setup({ run: vi.fn(async () => { throw new Error("Could not get credentials from OIDC context."); }) });
    const r = await call({ code: "print(1)" });
    expect(r.error).toContain("OIDC");
  });
});

describe("computationSource", () => {
  it("truncates long code in the excerpt and keys the id on code, inputs and day", () => {
    const d = [dataset("prices:AXP", "yh-axp")];
    const long = "x = 1\n".repeat(400);
    const s = computationSource(long, d, "out", "2026-09-25");
    expect(s.excerpt).toContain("more characters");
    expect(s.excerpt!.length).toBeLessThan(1_600);
    expect(computationSource(long, d, "other output", "2026-09-25").id).toBe(s.id);
    expect(computationSource(long, d, "out", "2026-09-26").id).not.toBe(s.id);
    expect(computationSource("y = 2", d, "out", "2026-09-25").id).not.toBe(s.id);
  });
});
