import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { EVAL_CASES, type EvalCase } from "./cases";
import { compareRuns, scoreTurn, summarize } from "./score";
import { parsePageContext } from "../page-context";

const tool = (name: string, input: unknown, output: unknown, state = "output-available") => ({ type: `tool-${name}`, toolCallId: `c-${name}-${JSON.stringify(input)}`, state, input, output });

const message = (parts: unknown[], metadata: Record<string, unknown> = {}): UIMessage => ({ id: "a", role: "assistant", parts: parts as UIMessage["parts"], metadata });

const backtest: EvalCase = {
  id: "backtest",
  question: "q",
  as: "exec",
  tags: ["portfolio"],
  expect: { calls: ["run_backtest"], notCalls: ["read_pt_sheet"], maxToolCalls: 2, maxErrors: 0, answer: [/hypothetical/i] },
};

describe("scoreTurn", () => {
  it("reproduces the production backtest failure as a failing case", () => {
    const m = message(
      [
        tool("run_backtest", { weights: { META: 5, GOOG: 3 } }, { data: null, error: "Scenario weights total 98.77%" }),
        tool("run_backtest", { weights: { META: 5, GOOG: 3 } }, { data: null, error: "Scenario weights total 98.77%" }),
        { type: "text", text: "I now have the current portfolio weights. Let me run it." },
        tool("read_pt_sheet", {}, { data: {} }),
        tool("run_backtest", { trades: [] }, { data: {} }),
        { type: "text", text: "A hypothetical replay: the scenario added 28 bp [src:backtest-1]." },
      ],
      { steps: 4, uncited: 0, ms: 60_000, usage: { input: 1000, output: 200 } },
    );
    const t = scoreTurn(backtest, m);
    expect(t.pass).toBe(false);
    expect(t.errors).toBe(2);
    expect(t.duplicates).toBe(1);
    expect(t.narration).toBe(1);
    expect(t.answer).toBe("A hypothetical replay: the scenario added 28 bp [src:backtest-1].");
    expect(t.checks.filter((c) => !c.pass).map((c) => c.name)).toEqual(["avoids read_pt_sheet", "≤ 2 lookups", "≤ 0 failed lookups", "no repeated lookups"]);
  });

  it("passes a clean turn, and counts failed tool parts from either error form", () => {
    const clean = scoreTurn(backtest, message([tool("run_backtest", { weights: { META: 5 } }, { data: {} }), { type: "text", text: "Hypothetical: +28 bp." }], { steps: 2 }));
    expect(clean.pass).toBe(true);
    const errored = scoreTurn(backtest, message([{ type: "tool-run_backtest", toolCallId: "x", state: "output-error", input: null, errorText: "Invalid arguments for run_backtest: to: bad date" }]));
    expect(errored.calls[0]).toMatchObject({ ok: false, error: "Invalid arguments for run_backtest: to: bad date" });
    expect(errored.checks.find((c) => c.name === "answered")?.pass).toBe(false);
  });

  it("accepts either tool of an a|b expectation", () => {
    const c: EvalCase = { ...backtest, expect: { calls: ["get_news|search_web"] } };
    expect(scoreTurn(c, message([tool("search_web", { query: "x" }, { data: {} }), { type: "text", text: "ok" }])).pass).toBe(true);
    expect(scoreTurn(c, message([tool("get_quote", { ticker: "X" }, { data: {} }), { type: "text", text: "ok" }])).pass).toBe(false);
  });
});

describe("summarize and compareRuns", () => {
  it("adds up a run and lists regressions first", () => {
    const pass = scoreTurn({ ...backtest, id: "a" }, message([tool("run_backtest", {}, { data: {} }), { type: "text", text: "Hypothetical." }], { ms: 10 }));
    const fail = scoreTurn({ ...backtest, id: "b" }, message([{ type: "text", text: "no" }], { ms: 30 }));
    expect(summarize([pass, fail])).toMatchObject({ cases: 2, passed: 1, lookups: 1, medianMs: 30 });
    const before = [pass, { ...fail, id: "c" }, { ...pass, id: "b" }];
    const after = [{ ...pass, id: "c" }, fail];
    expect(compareRuns(before, after).map((r) => `${r.id}:${r.change}`)).toEqual(["b:regressed", "c:fixed"]);
  });
});

describe("EVAL_CASES", () => {
  it("have unique ids and page contexts the server would accept", () => {
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
    for (const c of EVAL_CASES) if (c.page) expect(parsePageContext(c.page), c.id).not.toBeNull();
  });
});
