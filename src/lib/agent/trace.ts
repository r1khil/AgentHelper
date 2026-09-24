import type { ToolSet } from "ai";
import type { LanguageModelUsage } from "ai";
import { runWithTrace, type TraceSink } from "@/lib/trace/context";
import type { TraceUsage } from "@/lib/trace/events";
import type { ToolResult } from "@/lib/agent/tools";

type Exec = (input: unknown, opts: { toolCallId: string }) => unknown;

/**
 * Wrap every tool so its execution runs inside the trace context: the tool start/end is
 * reported, and provider calls underneath (cache, rate limiter, Drive) attribute their
 * events to this tool call. Tools swallow errors into `ToolResult.error`, so `ok` reads that.
 */
export function instrumentTools<T extends ToolSet>(tools: T, sink: TraceSink): T {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    const exec = t.execute as Exec | undefined;
    if (!exec) {
      out[name] = t;
      continue;
    }
    out[name] = {
      ...t,
      execute: async (input: unknown, opts: { toolCallId: string }) => {
        const t0 = Date.now();
        sink.emit({ t: "tool.start", tool: name, args: input, toolCallId: opts.toolCallId });
        try {
          const output = (await runWithTrace({ sink, toolCallId: opts.toolCallId }, () => exec(input, opts))) as ToolResult<unknown> | undefined;
          const error = output && typeof output === "object" ? output.error : undefined;
          sink.emit({
            t: "tool.end",
            tool: name,
            toolCallId: opts.toolCallId,
            ms: Date.now() - t0,
            ok: !error,
            error,
            sources: output && typeof output === "object" ? (output.sources?.length ?? 0) : 0,
            bytes: approxBytes(output),
          });
          return output;
        } catch (e) {
          sink.emit({ t: "tool.end", tool: name, toolCallId: opts.toolCallId, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e), sources: 0 });
          throw e;
        }
      },
    };
  }
  return out as T;
}

function approxBytes(v: unknown) {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? undefined : s.length;
  } catch {
    return undefined;
  }
}

/** Two calls' usage added field by field; a field neither reported stays undefined. */
export function sumTraceUsage(a: TraceUsage, b: TraceUsage): TraceUsage {
  const out: TraceUsage = {};
  for (const k of ["input", "output", "total", "reasoning", "cacheRead", "cacheWrite"] as const) {
    if (a[k] !== undefined || b[k] !== undefined) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  }
  return out;
}

export function traceUsage(u: LanguageModelUsage | undefined): TraceUsage {
  if (!u) return {};
  return {
    input: u.inputTokens,
    output: u.outputTokens,
    total: u.totalTokens,
    reasoning: u.outputTokenDetails?.reasoningTokens,
    cacheRead: u.inputTokenDetails?.cacheReadTokens,
    cacheWrite: u.inputTokenDetails?.cacheWriteTokens,
  };
}
