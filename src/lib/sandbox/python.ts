import "server-only";
import type { Sandbox } from "@vercel/sandbox";

/**
 * Runs model-written Python in a Vercel Sandbox microVM. The interpreter and the scientific stack
 * (pandas, numpy, scipy, statsmodels) live in a snapshot built once from the managed Python image;
 * every run starts from that snapshot with the network denied, writes its input files, runs one
 * script with a hard timeout and stops the VM. Runs are non-persistent so a stop never saves state.
 */

export const PYTHON_IMAGE = "vercel/sandbox/python:3.14";
export const PYTHON_PACKAGES = ["pandas", "numpy", "scipy", "statsmodels"] as const;
export const WORK_DIR = "/vercel/sandbox";
export const DATA_DIR = `${WORK_DIR}/data`;
export const RUN_TIMEOUT_MS = 60_000;
export const STDOUT_LIMIT = 8_000;
export const STDERR_LIMIT = 4_000;
/** Where the app keeps the current snapshot id (app_settings key). */
export const SNAPSHOT_SETTING = "sandbox:python_snapshot";
/** Snapshots expire this long after their last use; each run from one resets the clock. */
const SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const TAGS = { app: "owlfund", purpose: "run_python" };

type Credentials = { token: string; teamId: string; projectId: string };

/** An access token with team and project ids wins; otherwise the SDK finds the OIDC token itself. */
export function sandboxCredentials(env: NodeJS.ProcessEnv = process.env): Credentials | undefined {
  const { VERCEL_TOKEN: token, VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId } = env;
  return token && teamId && projectId ? { token, teamId, projectId } : undefined;
}

/**
 * Whether sandbox runs can authenticate here: an access token, a pulled development OIDC token, or a
 * Vercel deployment (where the OIDC token arrives with each request). SANDBOX_DISABLED=1 turns it off.
 */
export function sandboxAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SANDBOX_DISABLED === "1" || env.SANDBOX_DISABLED === "true") return false;
  return Boolean(sandboxCredentials(env) || env.VERCEL_OIDC_TOKEN || env.VERCEL === "1");
}

/** Where the snapshot id is remembered between runs; the app uses app_settings, scripts pass their own. */
export type SnapshotStore = { get(): Promise<string | null>; set(id: string): Promise<void> };

async function settingsStore(): Promise<SnapshotStore> {
  const { getSetting, setSetting } = await import("@/lib/settings");
  return { get: () => getSetting(SNAPSHOT_SETTING, { fresh: true }), set: (id) => setSetting(SNAPSHOT_SETTING, id, null) };
}

export type PythonFile = { path: string; content: string };
export type PythonRun = {
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** True when this run had to build the package snapshot first. */
  coldStart: boolean;
};

// Wide tables print in full up to a point; runpy keeps "main.py" and its line numbers in tracebacks.
const PRELUDE = `import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)
try:
    import pandas as _pd
    warnings.filterwarnings("ignore", category=getattr(_pd.errors, "Pandas4Warning", FutureWarning))
    _pd.set_option("display.width", 160)
    _pd.set_option("display.max_columns", 30)
    _pd.set_option("display.max_rows", 80)
except Exception:
    pass
`;
const RUNNER = `exec(open("_prelude.py").read(), {})\nimport runpy\nrunpy.run_path("main.py", run_name="__main__")`;

export function truncateHead(s: string, limit: number) {
  return s.length <= limit ? s : `${s.slice(0, limit)}\n… [${s.length - limit} more characters truncated]`;
}
export function truncateTail(s: string, limit: number) {
  return s.length <= limit ? s : `[${s.length - limit} earlier characters truncated] …\n${s.slice(-limit)}`;
}

function isMissingSnapshot(e: unknown) {
  const msg = e instanceof Error ? `${e.message} ${(e as { text?: string }).text ?? ""}` : String(e);
  return /snapshot/i.test(msg);
}

async function sdk() {
  return (await import("@vercel/sandbox")).Sandbox;
}

/** Installs the packages into a fresh VM from the managed image and snapshots it (which stops the VM). */
export async function buildPythonSnapshot(store: SnapshotStore): Promise<string> {
  const Sandbox = await sdk();
  const box = await Sandbox.create({ ...sandboxCredentials(), image: PYTHON_IMAGE, persistent: false, timeout: BUILD_TIMEOUT_MS, resources: { vcpus: 2 }, tags: { ...TAGS, purpose: "run_python_build" } });
  try {
    const pip = await box.runCommand({ cmd: "python3", args: ["-m", "pip", "install", "--no-cache-dir", "--disable-pip-version-check", "--quiet", ...PYTHON_PACKAGES], sudo: true, timeoutMs: BUILD_TIMEOUT_MS - 60_000 });
    if (pip.exitCode !== 0) throw new Error(`Installing ${PYTHON_PACKAGES.join(", ")} failed: ${truncateTail(await pip.stderr(), 600)}`);
    const check = await box.runCommand("python3", ["-c", `import ${PYTHON_PACKAGES.join(", ")}`]);
    if (check.exitCode !== 0) throw new Error(`The installed packages do not import: ${truncateTail(await check.stderr(), 600)}`);
    const snap = await box.snapshot({ expiration: SNAPSHOT_TTL_MS });
    await store.set(snap.snapshotId);
    return snap.snapshotId;
  } catch (e) {
    await box.stop().catch(() => undefined);
    throw e;
  }
}

/**
 * Runs `code` as main.py with `files` written first (paths relative to the working directory).
 * Network access is denied for the whole run; the VM is stopped whatever happens.
 */
export async function runPython(input: { code: string; files?: PythonFile[]; timeoutMs?: number; store?: SnapshotStore }): Promise<PythonRun> {
  const Sandbox = await sdk();
  const store = input.store ?? (await settingsStore());
  const timeoutMs = input.timeoutMs ?? RUN_TIMEOUT_MS;
  const base = { ...sandboxCredentials(), persistent: false, networkPolicy: "deny-all" as const, timeout: timeoutMs + 60_000, resources: { vcpus: 1 }, tags: TAGS };
  const fromSnapshot = (snapshotId: string) => Sandbox.create({ ...base, source: { type: "snapshot", snapshotId } });

  let coldStart = false;
  let box: Sandbox | null = null;
  const saved = await store.get();
  if (saved) {
    try {
      box = await fromSnapshot(saved);
    } catch (e) {
      // An expired or deleted snapshot is rebuilt once; anything else is a real failure.
      if (!isMissingSnapshot(e)) throw e;
    }
  }
  if (!box) {
    coldStart = true;
    box = await fromSnapshot(await buildPythonSnapshot(store));
  }

  try {
    await box.writeFiles([
      ...(input.files ?? []).map((f) => ({ path: `${WORK_DIR}/${f.path}`, content: f.content })),
      { path: `${WORK_DIR}/_prelude.py`, content: PRELUDE },
      { path: `${WORK_DIR}/main.py`, content: input.code },
    ]);
    const started = Date.now();
    const cmd = await box.runCommand({ cmd: "python3", args: ["-c", RUNNER], cwd: WORK_DIR, env: { PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", MPLBACKEND: "Agg" }, timeoutMs });
    const durationMs = cmd.durationMs ?? Date.now() - started;
    const [stdout, stderr] = [await cmd.stdout(), await cmd.stderr()];
    const timedOut = cmd.exitCode !== 0 && durationMs >= timeoutMs - 1_000;
    return { exitCode: cmd.exitCode, timedOut, stdout: truncateHead(stdout, STDOUT_LIMIT), stderr: truncateTail(stderr, STDERR_LIMIT), durationMs, coldStart };
  } finally {
    await box.stop().catch(() => undefined);
  }
}
