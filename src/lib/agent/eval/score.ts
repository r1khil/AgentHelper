import type { UIMessage } from "ai";
import type { AgentMetadata } from "@/lib/trace/events";
import { isToolPart, splitAssistantParts, toolFailed, toolName, type ToolPart } from "../turn";
import type { EvalCase } from "./cases";
import { proposalsOf } from "@/lib/hoot/proposals";

export type EvalToolCall = { name: string; input: unknown; ok: boolean; error?: string };

export type EvalCheck = { name: string; pass: boolean; detail?: string };

/** What one turn did, measured the same way for every case so runs can be compared. */
export type EvalTurn = {
  id: string;
  pass: boolean;
  checks: EvalCheck[];
  calls: EvalToolCall[];
  /** Tool calls that came back with an error. */
  errors: number;
  /** Calls repeating an earlier call's tool and arguments exactly. */
  duplicates: number;
  /** "Let me…" text written between lookups instead of in the answer. */
  narration: number;
  steps: number | null;
  uncited: number | null;
  repaired: boolean;
  writeUp: string | null;
  unanswered: boolean;
  ms: number | null;
  tokens: { input: number | null; output: number | null };
  /** Tools offered on each research step (tool routing); null when the turn didn't record it. */
  activeTools: number[] | null;
  /** Calls to a tool the step didn't offer ("unavailable tool"): routing left out something the model needed. */
  unavailable: number;
  answer: string;
};

/** The SDK's error for a call to a tool that wasn't offered, as saved on the part. */
const UNAVAILABLE = /unavailable tool|no tool named|NoSuchToolError/i;

/** "a|b" passes when either tool was called. */
const calledAny = (names: Set<string>, alternatives: string) => alternatives.split("|").some((n) => names.has(n));

export function scoreTurn(c: EvalCase, message: UIMessage): EvalTurn {
  const { activity, answer } = splitAssistantParts(message.parts);
  const tools = message.parts.filter(isToolPart) as ToolPart[];
  const calls: EvalToolCall[] = tools.map((p) => ({
    name: toolName(p),
    input: p.input ?? null,
    ok: !toolFailed(p),
    ...(toolFailed(p) ? { error: (p.output?.error ?? p.errorText ?? "failed").slice(0, 200) } : {}),
  }));
  const seen = new Set<string>();
  let duplicates = 0;
  for (const call of calls) {
    const key = `${call.name}:${JSON.stringify(call.input)}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  const narration = activity.filter((p) => p.type === "text" && p.text.trim().length > 0).length;
  const text = answer.map((p) => p.text).join("\n\n").trim();
  const meta = (message.metadata ?? {}) as AgentMetadata;
  const names = new Set(calls.map((x) => x.name));
  const errors = calls.filter((x) => !x.ok).length;

  const e = c.expect;
  const checks: EvalCheck[] = [];
  for (const need of e.calls ?? []) checks.push({ name: `calls ${need}`, pass: calledAny(names, need) });
  for (const avoid of e.notCalls ?? []) checks.push({ name: `avoids ${avoid}`, pass: !names.has(avoid) });
  const proposed = new Set(proposalsOf(tools).map((p) => p.proposal.kind as string));
  for (const kind of e.proposes ?? []) checks.push({ name: `proposes ${kind}`, pass: proposed.has(kind), detail: calls.find((x) => x.name === kind && !x.ok)?.error });
  if (e.maxToolCalls !== undefined) checks.push({ name: `≤ ${e.maxToolCalls} lookups`, pass: calls.length <= e.maxToolCalls, detail: `${calls.length}` });
  if (e.maxErrors !== undefined) checks.push({ name: `≤ ${e.maxErrors} failed lookups`, pass: errors <= e.maxErrors, detail: calls.filter((x) => !x.ok).map((x) => `${x.name}: ${x.error}`).join(" | ") || undefined });
  for (const re of e.answer ?? []) checks.push({ name: `answer ~ ${re}`, pass: re.test(text) });
  for (const re of e.answerNot ?? []) checks.push({ name: `answer !~ ${re}`, pass: !re.test(text), detail: re.exec(text)?.[0] });
  if (e.href) {
    const hrefs = tools.flatMap((p) => {
      const href = toolName(p) === "navigate" ? (p.output?.data as { action?: { href?: unknown } } | undefined)?.action?.href : undefined;
      return typeof href === "string" ? [href] : [];
    });
    checks.push({ name: `opened ${e.href}`, pass: hrefs.some((h) => e.href!.test(h)), detail: hrefs.join(", ") || "nothing opened" });
  }
  checks.push({ name: "answered", pass: Boolean(text) && !meta.unanswered });
  checks.push({ name: "no repeated lookups", pass: duplicates === 0, detail: duplicates ? `${duplicates}` : undefined });

  return {
    id: c.id,
    pass: checks.every((x) => x.pass),
    checks,
    calls,
    errors,
    duplicates,
    narration,
    steps: meta.steps ?? null,
    uncited: meta.uncited ?? null,
    repaired: Boolean(meta.repaired),
    writeUp: meta.writeUp ?? null,
    unanswered: Boolean(meta.unanswered),
    ms: meta.ms ?? null,
    tokens: { input: meta.usage?.input ?? null, output: meta.usage?.output ?? null },
    activeTools: meta.activeTools ?? null,
    unavailable: calls.filter((x) => !x.ok && UNAVAILABLE.test(x.error ?? "")).length,
    answer: text,
  };
}

export type EvalSummary = {
  cases: number;
  passed: number;
  lookups: number;
  failedLookups: number;
  duplicates: number;
  narration: number;
  uncited: number;
  repaired: number;
  writeUps: number;
  unanswered: number;
  medianMs: number | null;
  tokens: { input: number; output: number };
  /** Mean tools offered per research step, over every step that recorded it. */
  avgActiveTools: number | null;
  unavailableTools: number;
};

export function summarize(turns: EvalTurn[]): EvalSummary {
  const ms = turns.map((t) => t.ms).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const sum = (f: (t: EvalTurn) => number) => turns.reduce((s, t) => s + f(t), 0);
  return {
    cases: turns.length,
    passed: turns.filter((t) => t.pass).length,
    lookups: sum((t) => t.calls.length),
    failedLookups: sum((t) => t.errors),
    duplicates: sum((t) => t.duplicates),
    narration: sum((t) => t.narration),
    uncited: sum((t) => t.uncited ?? 0),
    repaired: sum((t) => (t.repaired ? 1 : 0)),
    writeUps: sum((t) => (t.writeUp ? 1 : 0)),
    unanswered: sum((t) => (t.unanswered ? 1 : 0)),
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    tokens: { input: sum((t) => t.tokens.input ?? 0), output: sum((t) => t.tokens.output ?? 0) },
    avgActiveTools: mean(turns.flatMap((t) => t.activeTools ?? [])),
    unavailableTools: sum((t) => t.unavailable),
  };
}

const mean = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);

/** Per-case changes between two runs: newly failing cases first, since those are regressions. */
export type RunChange = { id: string; change: "regressed" | "fixed" | "same"; lookups: [number, number] };

export function compareRuns(before: EvalTurn[], after: EvalTurn[]): RunChange[] {
  const prior = new Map(before.map((t) => [t.id, t]));
  const rank = { regressed: 0, fixed: 1, same: 2 } as const;
  return after
    .flatMap((t): RunChange[] => {
      const b = prior.get(t.id);
      if (!b) return [];
      const change = b.pass && !t.pass ? "regressed" : !b.pass && t.pass ? "fixed" : "same";
      return [{ id: t.id, change, lookups: [b.calls.length, t.calls.length] }];
    })
    .sort((a, b) => rank[a.change] - rank[b.change]);
}
