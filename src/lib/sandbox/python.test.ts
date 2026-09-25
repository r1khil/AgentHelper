import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));

type Cmd = { exitCode: number; durationMs?: number; stdout: () => Promise<string>; stderr: () => Promise<string> };
const cmd = (exitCode: number, out = "", err = "", durationMs = 100): Cmd => ({ exitCode, durationMs, stdout: async () => out, stderr: async () => err });

const state = vi.hoisted(() => ({ created: [] as Record<string, unknown>[], createImpl: null as null | ((p: Record<string, unknown>) => unknown) }));

function fakeBox(run: (params: unknown, args?: unknown) => Cmd | Promise<Cmd>) {
  return {
    writeFiles: vi.fn<(files: { path: string; content: string }[]) => Promise<void>>(async () => undefined),
    runCommand: vi.fn(async (p: unknown, a?: unknown) => run(p, a)),
    stop: vi.fn(async () => ({})),
    snapshot: vi.fn(async () => ({ snapshotId: "snap_new" })),
  };
}

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn(async (p: Record<string, unknown>) => {
      state.created.push(p);
      return state.createImpl!(p);
    }),
  },
}));

import { buildPythonSnapshot, DATA_DIR, runPython, sandboxAvailable, sandboxCredentials, STDOUT_LIMIT, truncateHead, truncateTail, WORK_DIR, type SnapshotStore } from "./python";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const store = (id: string | null): SnapshotStore & { set: ReturnType<typeof vi.fn> } => ({ get: vi.fn(async () => id), set: vi.fn(async () => undefined) });

beforeEach(() => {
  state.created = [];
  state.createImpl = null;
});

describe("sandboxAvailable", () => {
  it("accepts an OIDC token, an access token triple, or a Vercel deployment", () => {
    expect(sandboxAvailable(env({ VERCEL_OIDC_TOKEN: "x" }))).toBe(true);
    expect(sandboxAvailable(env({ VERCEL: "1" }))).toBe(true);
    expect(sandboxAvailable(env({ VERCEL_TOKEN: "t", VERCEL_TEAM_ID: "team", VERCEL_PROJECT_ID: "prj" }))).toBe(true);
    expect(sandboxAvailable(env({ VERCEL_TOKEN: "t" }))).toBe(false);
    expect(sandboxAvailable(env({}))).toBe(false);
  });

  it("can be switched off", () => {
    expect(sandboxAvailable(env({ VERCEL: "1", SANDBOX_DISABLED: "1" }))).toBe(false);
  });

  it("passes explicit credentials only when all three are set", () => {
    expect(sandboxCredentials(env({ VERCEL_TOKEN: "t", VERCEL_TEAM_ID: "team", VERCEL_PROJECT_ID: "prj" }))).toEqual({ token: "t", teamId: "team", projectId: "prj" });
    expect(sandboxCredentials(env({ VERCEL_TOKEN: "t", VERCEL_TEAM_ID: "team" }))).toBeUndefined();
  });
});

describe("truncation", () => {
  it("keeps the head of stdout and the tail of stderr", () => {
    expect(truncateHead("abcdef", 3)).toBe("abc\n… [3 more characters truncated]");
    expect(truncateTail("abcdef", 3)).toBe("[3 earlier characters truncated] …\ndef");
    expect(truncateHead("abc", 3)).toBe("abc");
  });
});

describe("runPython", () => {
  it("starts from the saved snapshot offline, writes inputs and code, runs with a timeout and stops", async () => {
    const box = fakeBox(() => cmd(0, "42\n"));
    state.createImpl = () => box;
    const s = store("snap_1");
    const r = await runPython({ code: "print(42)", files: [{ path: "data/prices_AXP.csv", content: "date,close\n" }], store: s });

    expect(r).toMatchObject({ exitCode: 0, timedOut: false, stdout: "42\n", coldStart: false });
    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({ source: { type: "snapshot", snapshotId: "snap_1" }, networkPolicy: "deny-all", persistent: false, resources: { vcpus: 1 } });
    const written = box.writeFiles.mock.calls[0][0];
    expect(written.map((f) => f.path)).toEqual([`${DATA_DIR}/prices_AXP.csv`, `${WORK_DIR}/_prelude.py`, `${WORK_DIR}/main.py`]);
    expect(written[2].content).toBe("print(42)");
    const run = box.runCommand.mock.calls[0][0] as { cmd: string; cwd: string; timeoutMs: number };
    expect(run).toMatchObject({ cmd: "python3", cwd: WORK_DIR, timeoutMs: 60_000 });
    expect(box.stop).toHaveBeenCalledOnce();
    expect(s.set).not.toHaveBeenCalled();
  });

  it("stops the sandbox when the run itself throws", async () => {
    const box = fakeBox(() => {
      throw new Error("stream broke");
    });
    state.createImpl = () => box;
    await expect(runPython({ code: "x", store: store("snap_1") })).rejects.toThrow("stream broke");
    expect(box.stop).toHaveBeenCalledOnce();
  });

  it("flags a run killed at the timeout and truncates long output", async () => {
    const box = fakeBox(() => cmd(137, "y".repeat(STDOUT_LIMIT + 50), "", 5_000));
    state.createImpl = () => box;
    const r = await runPython({ code: "while True: pass", timeoutMs: 5_000, store: store("snap_1") });
    expect(r.timedOut).toBe(true);
    expect(r.stdout).toContain("[50 more characters truncated]");
  });

  it("reports a Python error without calling it a timeout", async () => {
    state.createImpl = () => fakeBox(() => cmd(1, "", "Traceback...\nZeroDivisionError: division by zero", 300));
    const r = await runPython({ code: "1/0", store: store("snap_1") });
    expect(r).toMatchObject({ exitCode: 1, timedOut: false });
    expect(r.stderr).toContain("ZeroDivisionError");
  });

  it("rebuilds the package snapshot when the saved one is gone, then runs from the new one", async () => {
    const build = fakeBox(() => cmd(0));
    const run = fakeBox(() => cmd(0, "ok"));
    state.createImpl = (p) => {
      const src = p.source as { snapshotId?: string } | undefined;
      if (src?.snapshotId === "snap_old") throw new Error("Snapshot snap_old not found");
      return src ? run : build;
    };
    const s = store("snap_old");
    const r = await runPython({ code: "print('ok')", store: s });
    expect(r.coldStart).toBe(true);
    expect(state.created.map((p) => (p.source as { snapshotId?: string } | undefined)?.snapshotId ?? p.image)).toEqual(["snap_old", "vercel/sandbox/python:3.14", "snap_new"]);
    expect(s.set).toHaveBeenCalledWith("snap_new");
    expect(run.stop).toHaveBeenCalledOnce();
  });

  it("builds the snapshot on first use", async () => {
    state.createImpl = (p) => (p.source ? fakeBox(() => cmd(0, "ok")) : fakeBox(() => cmd(0)));
    const s = store(null);
    const r = await runPython({ code: "print('ok')", store: s });
    expect(r.coldStart).toBe(true);
    expect(s.set).toHaveBeenCalledWith("snap_new");
  });

  it("does not rebuild on unrelated create failures", async () => {
    state.createImpl = () => {
      throw new Error("429 Too Many Requests");
    };
    const s = store("snap_1");
    await expect(runPython({ code: "x", store: s })).rejects.toThrow("429");
    expect(state.created).toHaveLength(1);
    expect(s.set).not.toHaveBeenCalled();
  });
});

describe("buildPythonSnapshot", () => {
  it("installs the scientific stack from the managed image, checks the imports and snapshots", async () => {
    const box = fakeBox(() => cmd(0));
    state.createImpl = () => box;
    const s = store(null);
    await expect(buildPythonSnapshot(s)).resolves.toBe("snap_new");
    const pip = box.runCommand.mock.calls[0][0] as { args: string[]; sudo: boolean };
    expect(pip.args).toEqual(expect.arrayContaining(["pip", "install", "pandas", "numpy", "scipy", "statsmodels"]));
    expect(box.snapshot).toHaveBeenCalledOnce();
    expect(s.set).toHaveBeenCalledWith("snap_new");
  });

  it("stops the VM and saves nothing when pip fails", async () => {
    const box = fakeBox(() => cmd(1, "", "No matching distribution"));
    state.createImpl = () => box;
    const s = store(null);
    await expect(buildPythonSnapshot(s)).rejects.toThrow("No matching distribution");
    expect(box.stop).toHaveBeenCalledOnce();
    expect(box.snapshot).not.toHaveBeenCalled();
    expect(s.set).not.toHaveBeenCalled();
  });
});
