import type { PageContext } from "@/lib/agent/page-context";
import type { WriteUpReason } from "@/lib/agent/turn-finish";
import type { UIMessage } from "ai";

/** Where a provider call was answered from. `network` is a live upstream request. */
export type TraceLayer = "memory" | "db" | "network";

export type TraceUsage = { input?: number; output?: number; total?: number; reasoning?: number; cacheRead?: number; cacheWrite?: number };

type Base = {
  /** Monotonic within one agent turn. */
  seq: number;
  /** Epoch ms. */
  at: number;
  /** Zero-based model step this event belongs to, or null before the first step. */
  step: number | null;
  /** Set for events raised while a tool was executing. */
  toolCallId?: string;
};

/**
 * One event in the live transparency trace of an agent turn. Streamed to the browser as a
 * transient `data-trace` part (never persisted), only when the user has transparency mode on.
 */
export type TraceEvent = Base &
  (
    | { t: "run.start"; chatId: string; modelId: string; maxSteps: number }
    | { t: "step.start"; modelId: string; provider: string; toolChoice: string; final: boolean; writeUp?: WriteUpReason; activeTools?: number; totalTools?: number }
    | { t: "step.end"; finishReason: string; rawFinishReason?: string; ms: number; usage: TraceUsage; toolCalls: number }
    | { t: "tool.start"; tool: string; args: unknown }
    | { t: "tool.end"; tool: string; ms: number; ok: boolean; error?: string; sources: number; bytes?: number }
    | { t: "fetch"; host: string; key?: string; url?: string; layer: TraceLayer; ms: number; bytes?: number; ttlSeconds?: number; ok: boolean; error?: string; status?: number }
    | { t: "wait"; host: string; ms: number }
    | { t: "retry"; attempt: number; backoffMs: number; error: string }
    | { t: "model.fallback"; from: string; to: string; error: string }
    | { t: "run.end"; ms: number; steps: number; usage: TraceUsage }
  );

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** What callers pass to `sink.emit`: the sink stamps seq, at and step. */
export type TraceEventInput = DistributiveOmit<TraceEvent, "seq" | "at" | "step">;

export type AgentMetadata = {
  uncited?: number;
  model?: string;
  /** The answer went through the citation-repair pass. */
  repaired?: boolean;
  /** On a question: the page it was asked from (attached by Hoot). */
  page?: PageContext;
  /** Tokens the provider reported for the whole turn, summed over every model step. */
  usage?: TraceUsage;
  /** Model steps the turn took. */
  steps?: number;
  /** Tokens spent by the citation-repair call, billed on top of `usage`. */
  repairUsage?: TraceUsage;
  /** Why the research ended without a usable answer and went to a write-up from the evidence. */
  writeUp?: WriteUpReason;
  /** Tokens spent by that write-up, billed on top of `usage`. */
  writeUpUsage?: TraceUsage;
  /** The saved answer is the notice that none could be written. */
  unanswered?: boolean;
  /** How long the turn took, question to saved answer, for "Worked for 12s". */
  ms?: number;
  /** How many tools each research step offered the model (tool routing), in step order. */
  activeTools?: number[];
};
export type AgentDataParts = { trace: TraceEvent };
export type AgentUIMessage = UIMessage<AgentMetadata, AgentDataParts>;

/** Host label from a provider cache key such as `yahoo:quote:NVDA`. */
export function hostFromKey(key: string) {
  const i = key.indexOf(":");
  return i > 0 ? key.slice(0, i) : key;
}
