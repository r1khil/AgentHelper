import { AsyncLocalStorage } from "node:async_hooks";
import type { TraceEvent, TraceEventInput } from "./events";

export type TraceSink = {
  emit(e: TraceEventInput): void;
  subscribe(fn: (e: TraceEvent) => void): () => void;
  setStep(n: number | null): void;
  /** Events so far, for scripts and tests. */
  events(): TraceEvent[];
};

type Store = { sink: TraceSink; toolCallId?: string };

const als = new AsyncLocalStorage<Store>();

/**
 * Collects trace events for one agent turn. Events are stamped with a sequence number, a
 * timestamp, the current model step, and the tool call they were raised under (from the
 * async context set by `runWithTrace`).
 */
export function createTraceSink(): TraceSink {
  let seq = 0;
  let step: number | null = null;
  const listeners = new Set<(e: TraceEvent) => void>();
  const all: TraceEvent[] = [];
  return {
    emit(input) {
      const store = als.getStore();
      const e = { toolCallId: store?.toolCallId, ...input, seq: seq++, at: Date.now(), step } as TraceEvent;
      all.push(e);
      for (const fn of listeners) {
        try {
          fn(e);
        } catch {
          // A broken listener must never break the agent.
        }
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setStep(n) {
      step = n;
    },
    events() {
      return all.slice();
    },
  };
}

/** Run `fn` with a trace sink in async context so provider calls underneath can report to it. */
export function runWithTrace<T>(store: Store, fn: () => T): T {
  return als.run(store, fn);
}

/** The sink for the current async context, or undefined when transparency is off (the hot path). */
export function currentTrace(): TraceSink | undefined {
  return als.getStore()?.sink;
}
