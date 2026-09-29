import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { CurrentUser } from "@/lib/auth";
import { sourceId, type Source } from "@/lib/providers/types";
import { DATASET_RANGES, loadDataset, type Dataset, type DatasetRequest } from "@/lib/sandbox/datasets";
import { runPython, sandboxAvailable, type PythonRun } from "@/lib/sandbox/python";
import { countSandboxRun, DAILY_RUN_LIMIT, nyDay } from "@/lib/sandbox/quota";
import type { ToolResult } from "./tools";

const MAX_DATASETS = 8;
const MAX_CODE = 20_000;
const CODE_IN_EXCERPT = 1_200;

export type SandboxToolDeps = {
  run?: (input: { code: string; files: { path: string; content: string }[] }) => Promise<PythonRun>;
  load?: (req: DatasetRequest) => Promise<Dataset>;
  countRun?: (userId: string) => Promise<number>;
  limit?: number;
};

/** The "Computation" source: which inputs went in (by source id), what came out first, and the code itself. */
export function computationSource(code: string, datasets: Dataset[], stdout: string, day: string): Source {
  const inputs = datasets.length ? datasets.map((d) => `${d.name} ${d.firstDate ?? ""}…${d.lastDate ?? ""} [${d.source.id}]`).join("; ") : "none";
  const firstLines = stdout.trim().split("\n").slice(0, 3).join(" | ").slice(0, 200);
  const shownCode = code.length > CODE_IN_EXCERPT ? `${code.slice(0, CODE_IN_EXCERPT)}\n# … ${code.length - CODE_IN_EXCERPT} more characters` : code;
  return {
    id: sourceId("calc", `${day}\n${datasets.map((d) => `${d.source.id}:${d.lastDate}`).join(",")}\n${code}`),
    title: `Python computation · ${datasets.length ? datasets.map((d) => d.name).join(", ") : "no datasets"}`,
    publisher: "Hoot code sandbox (Python on Vercel Sandbox)",
    publishedAt: day,
    retrievedAt: new Date().toISOString(),
    sourceType: "Computation",
    excerpt: `Inputs: ${inputs}. Output: ${firstLines || "(nothing printed)"}\nCode:\n${shownCode}`,
  };
}

/**
 * run_python: model-written Python in an offline Vercel Sandbox, with the app's own data written in as CSV
 * files so numbers are never pasted by hand. Only built for a signed-in member (datasets follow their
 * access rules) and only where sandbox credentials exist; each member gets DAILY_RUN_LIMIT runs a day.
 */
export function makeSandboxTools(ctx: { viewer: CurrentUser; teamId: string | null }, deps: SandboxToolDeps = {}): ToolSet {
  if (!deps.run && !sandboxAvailable()) return {};
  const run = deps.run ?? ((input) => runPython(input));
  const load = deps.load ?? ((req) => loadDataset(ctx, req));
  const countRun = deps.countRun ?? ((userId) => countSandboxRun(userId));
  const limit = deps.limit ?? DAILY_RUN_LIMIT;

  return {
    run_python: tool({
      description:
        "Run Python 3 (pandas, numpy, scipy, statsmodels) in an isolated sandbox for statistics the other tools do not compute: regressions and betas, correlations, custom screens across tickers, scenario and sizing math, rolling or distribution statistics. " +
        "Load inputs with `datasets` instead of typing numbers into the code; each becomes a CSV in data/ (the result lists every file's path, columns and date range): " +
        "'prices:<TICKER>' daily date,open,high,low,close,adj_close,volume from Yahoo Finance (range default 1y; use adj_close for returns); " +
        "'holdings' the current holdings and saved weights (the whole Fund for execs and admins, the member's team otherwise); " +
        "'returns' (or 'returns:fund' / 'returns:team') daily portfolio returns from the trade ledger as decimals with the sector benchmark (and S&P 500 for the fund), under the Attribution pages' access rules (range default itd). " +
        "The code runs offline (no internet, no pip), for at most 60 seconds, and only printed output comes back (about 8,000 characters): print() the final numbers with labels and units, rounded, and small tables with DataFrame.to_string(); no charts. " +
        `Each member has ${limit} runs a day, so get the code right the first time. Cite computed numbers with the run's Computation sourceId and the inputs with their dataset sourceIds.`,
      inputSchema: z.object({
        code: z.string().min(1).max(MAX_CODE).describe("A complete Python script. Read inputs with pandas, e.g. pd.read_csv('data/prices_AXP.csv', parse_dates=['date']). Print every result."),
        datasets: z
          .array(
            z.object({
              name: z.string().describe("prices:<TICKER> (e.g. prices:AXP, prices:SPY), holdings, returns, returns:fund or returns:team"),
              range: z.enum(DATASET_RANGES).optional().describe("Lookback for prices (default 1y, itd = 5y) and returns (default itd = since inception)"),
            }),
          )
          .max(MAX_DATASETS)
          .default([])
          .describe("Named inputs written to data/<name>.csv before the code runs, e.g. prices:AXP → data/prices_AXP.csv"),
      }),
      execute: async ({ code, datasets: requested }): Promise<ToolResult<unknown>> => {
        const inputSources: Source[] = [];
        try {
          const names = new Set<string>();
          const datasets: Dataset[] = [];
          for (const req of requested ?? []) {
            const d = await load(req);
            if (names.has(d.name)) continue;
            names.add(d.name);
            datasets.push(d);
            if (!inputSources.some((s) => s.id === d.source.id)) inputSources.push(d.source);
          }
          const files = datasets.map((d) => ({ name: d.name, path: d.path, columns: d.columns, rows: d.rows, from: d.firstDate, to: d.lastDate, note: d.note, sourceId: d.source.id }));

          const used = await countRun(ctx.viewer.id);
          if (used > limit) throw new Error(`Daily limit reached: ${limit} Python runs per member per day. Answer from the tools' own figures instead, or try again tomorrow.`);

          const r = await run({ code, files: datasets.map((d) => ({ path: d.path, content: d.content })) });
          const base = { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr || undefined, durationMs: r.durationMs, coldStart: r.coldStart || undefined, files, runsLeftToday: Math.max(0, limit - used) };
          if (r.timedOut) return { data: base, sources: inputSources, error: "The script ran past the 60-second limit and was stopped. Simplify it (fewer loops, vectorize with pandas/numpy)." };
          if (r.exitCode !== 0) {
            const last = r.stderr.trim().split("\n").pop() ?? "";
            return { data: base, sources: inputSources, error: `Python exited with code ${r.exitCode}: ${last}. Fix the script and run it again; nothing it computed can be cited.` };
          }
          const calc = computationSource(code, datasets, r.stdout, nyDay());
          return { data: { ...base, sourceId: calc.id }, sources: [...inputSources, calc] };
        } catch (e) {
          return { data: null, sources: inputSources, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
