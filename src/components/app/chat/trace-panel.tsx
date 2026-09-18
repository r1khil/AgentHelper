"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceEvent, TraceUsage } from "@/lib/trace/events";

/** Everything the chat UI derives from the live trace of one turn. */
export type TraceView = {
  events: TraceEvent[];
  modelId: string | null;
  maxSteps: number | null;
  /** Steps started so far (1-based count). */
  stepsStarted: number;
  finished: boolean;
  usage: TraceUsage;
  startedAt: number | null;
  endedAt: number | null;
  /** Model step each tool call ran in. */
  stepOfCall: Map<string, number>;
  /** step.start / step.end pairs by step number. */
  steps: Map<number, { start?: Extract<TraceEvent, { t: "step.start" }>; end?: Extract<TraceEvent, { t: "step.end" }> }>;
  /** fetch / wait / retry events grouped by tool call. */
  fetchesByCall: Map<string, TraceEvent[]>;
  /** fetch / wait / retry events raised outside any tool call (e.g. Drive index refresh). */
  looseFetches: TraceEvent[];
  toolEnd: Map<string, Extract<TraceEvent, { t: "tool.end" }>>;
  /** Most recent provider event, for the live label. */
  latest: TraceEvent | null;
};

export function buildTraceView(events: TraceEvent[]): TraceView {
  const v: TraceView = {
    events,
    modelId: null,
    maxSteps: null,
    stepsStarted: 0,
    finished: false,
    usage: {},
    startedAt: null,
    endedAt: null,
    stepOfCall: new Map(),
    steps: new Map(),
    fetchesByCall: new Map(),
    looseFetches: [],
    toolEnd: new Map(),
    latest: null,
  };
  const add = (a: number | undefined, b: number | undefined) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  for (const e of events) {
    switch (e.t) {
      case "run.start":
        v.modelId = e.modelId;
        v.maxSteps = e.maxSteps;
        v.startedAt = e.at;
        break;
      case "step.start": {
        v.stepsStarted = Math.max(v.stepsStarted, (e.step ?? 0) + 1);
        const s = v.steps.get(e.step ?? 0) ?? {};
        s.start = e;
        v.steps.set(e.step ?? 0, s);
        break;
      }
      case "step.end": {
        const s = v.steps.get(e.step ?? 0) ?? {};
        s.end = e;
        v.steps.set(e.step ?? 0, s);
        v.usage = { input: add(v.usage.input, e.usage.input), output: add(v.usage.output, e.usage.output), total: add(v.usage.total, e.usage.total) };
        break;
      }
      case "tool.start":
        if (e.toolCallId) v.stepOfCall.set(e.toolCallId, e.step ?? 0);
        break;
      case "tool.end":
        if (e.toolCallId) v.toolEnd.set(e.toolCallId, e);
        break;
      case "fetch":
      case "wait":
      case "retry":
        if (e.toolCallId) {
          const list = v.fetchesByCall.get(e.toolCallId) ?? [];
          list.push(e);
          v.fetchesByCall.set(e.toolCallId, list);
        } else v.looseFetches.push(e);
        v.latest = e;
        break;
      case "run.end":
        v.finished = true;
        v.endedAt = e.at;
        if (e.usage.total !== undefined) v.usage = e.usage;
        break;
    }
  }
  return v;
}

const k = (n: number | undefined) => (n === undefined ? "–" : n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n >= 1000 ? `${(n / 1000).toFixed(2)}k` : String(n));
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
const kb = (b: number | undefined) => (b === undefined ? "" : b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : b >= 1000 ? `${Math.round(b / 1000)} KB` : `${b} B`);

/** One-line summary of the run: steps, model, tokens, elapsed. */
export function TraceHeader({ view, now }: { view: TraceView; now: number }) {
  const elapsed = view.startedAt ? (view.endedAt ?? now) - view.startedAt : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-0.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Transparency</span>
      <span>
        step {Math.max(view.stepsStarted, 1)}
        {view.maxSteps ? `/${view.maxSteps}` : ""}
      </span>
      {view.modelId && <span className="truncate">{view.modelId}</span>}
      <span className="tnum">
        {k(view.usage.input)} in / {k(view.usage.output)} out
      </span>
      <span className="tnum">{ms(elapsed)}</span>
      {view.finished && <span>done</span>}
    </div>
  );
}

/** Divider between model steps: tool choice, whether the final answer was forced, usage and finish reason. */
export function StepDivider({ n, view }: { n: number; view: TraceView }) {
  const s = view.steps.get(n);
  if (!s?.start) return null;
  const end = s.end;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5 pt-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Step {n + 1}</span>
      <span>tools: {s.start.toolChoice}</span>
      {s.start.final && <span className="text-warning-foreground">final step, prose forced</span>}
      {end ? (
        <>
          <span className="tnum">
            {k(end.usage.input)} in / {k(end.usage.output)} out
            {end.usage.cacheRead ? ` (${k(end.usage.cacheRead)} cached)` : ""}
          </span>
          <span>stop: {end.finishReason}{end.rawFinishReason && end.rawFinishReason !== end.finishReason ? ` (${end.rawFinishReason})` : ""}</span>
          <span className="tnum">{ms(end.ms)}</span>
        </>
      ) : (
        <span>running…</span>
      )}
    </div>
  );
}

const LAYER: Record<string, { label: string; className: string }> = {
  memory: { label: "memory", className: "bg-muted text-muted-foreground" },
  db: { label: "db cache", className: "bg-primary/10 text-foreground" },
  network: { label: "network", className: "bg-warning/15 text-warning-foreground" },
};

/** Provider calls made while one tool ran, and how long the tool took. */
export function FetchRows({ events, end }: { events: TraceEvent[]; end?: Extract<TraceEvent, { t: "tool.end" }> }) {
  if (events.length === 0 && !end) return null;
  return (
    <ul className="ml-5 space-y-0.5 text-[11px] text-muted-foreground">
      {events.map((e) => (
        <li key={e.seq} className="flex items-center gap-1.5">
          {e.t === "fetch" ? (
            <>
              <span className={cn("shrink-0 rounded px-1 font-medium", e.ok ? (LAYER[e.layer]?.className ?? "") : "bg-destructive/10 text-destructive")}>{e.ok ? LAYER[e.layer]?.label : "failed"}</span>
              <span className="shrink-0">{e.host}</span>
              <span className="min-w-0 truncate" title={e.key ?? e.url}>
                {e.key ?? e.url}
              </span>
              {e.status !== undefined && <span className="shrink-0">{e.status}</span>}
              <span className="ml-auto shrink-0 tnum">{ms(e.ms)}</span>
              {e.bytes !== undefined && e.ok && <span className="w-12 shrink-0 text-right tnum">{kb(e.bytes)}</span>}
              {e.error && <span className="truncate text-destructive">{e.error}</span>}
            </>
          ) : e.t === "wait" ? (
            <>
              <span className="shrink-0 rounded bg-muted px-1 font-medium">wait</span>
              <span>{e.host} rate limit</span>
              <span className="ml-auto shrink-0 tnum">{ms(e.ms)}</span>
            </>
          ) : e.t === "retry" ? (
            <>
              <RotateCcw className="size-3 shrink-0 text-warning-foreground" />
              <span className="text-warning-foreground">
                retry {e.attempt} in {ms(e.backoffMs)}
              </span>
              <span className="truncate">{e.error}</span>
            </>
          ) : null}
        </li>
      ))}
      {end && (
        <li className={cn("flex items-center gap-1.5", !end.ok && "text-destructive")}>
          {!end.ok && <AlertTriangle className="size-3 shrink-0" />}
          <span>
            {end.ok ? "done" : "failed"} in {ms(end.ms)}
            {end.sources ? ` · ${end.sources} source${end.sources === 1 ? "" : "s"}` : ""}
            {end.bytes !== undefined ? ` · ${kb(end.bytes)} to the model` : ""}
          </span>
        </li>
      )}
    </ul>
  );
}

/** Short live status for the collapsed activity row. */
export function latestLabel(view: TraceView): string | null {
  const e = view.latest;
  if (!e) return null;
  if (e.t === "fetch") return `${e.host} ${e.ok ? LAYER[e.layer]?.label : "failed"} ${ms(e.ms)}`;
  if (e.t === "wait") return `waiting ${ms(e.ms)} for ${e.host}`;
  if (e.t === "retry") return `retry ${e.attempt} after ${e.error}`;
  return null;
}
