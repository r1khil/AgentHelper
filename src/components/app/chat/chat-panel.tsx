"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { FetchRows, latestLabel, StepDivider, TraceHeader, type TraceView } from "./trace-panel";
import Link from "next/link";
import { ArrowUp, ChevronRight, Eye, Loader2, Wrench } from "lucide-react";
import { Citation, ResearchAnswer, ResearchSources } from "./research-answer";
import { useResearchChat } from "./use-research-chat";
import { clearHootQuestion, peekHootQuestion } from "@/components/app/hoot/handoff";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { HootHero } from "@/components/app/hoot/hoot-hero";
import { cn } from "@/lib/utils";
import { collectSources } from "@/lib/agent/citations";
import { pageContextLabel, parsePageContext } from "@/lib/agent/page-context";
import { isToolPart, splitAssistantParts, summarizeActivity, toolDone, toolFailed, toolName, type Part, type ToolPart } from "@/lib/agent/turn";
import type { RunStatus } from "@/lib/chats";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  "What moved {T} today versus the S&P 500, and what filings or news are in the window?",
  "Summarize the last 10-Q for {T}: revenue, margins, and guidance, with sources.",
  "Summarize the team's initiating coverage report on {T}: recorded thesis, key drivers, and what would break it, with citations.",
  "When does {T} report next? Pull the prior quarter's release and the key questions the team noted.",
  "Explain how to read the segment disclosure in {T}'s latest 10-K.",
];

/** General Hoot conversations (no pinned holding). Holding chats use the research board instead. */
export function ChatPanel({
  chatId,
  initialMessages,
  initialRunStatus,
  tickers,
  configured,
  transparency = false,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  initialRunStatus: RunStatus;
  tickers: string[];
  configured: boolean;
  /** Exec/admin transparency mode: the server streams a live trace and this panel renders it. */
  transparency?: boolean;
}) {
  const { messages, status, streaming, busy, catchingUp, runError, requestError, traceView, now, send, stopWatching } = useResearchChat({ chatId, initialMessages, initialRunStatus, transparency });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status, catchingUp]);

  const sources = useMemo(() => collectSources(messages), [messages]);

  // A question asked through Hoot: send it once the chat is ready. Deferred a tick, like the research board,
  // because the SDK's sendMessage returns silently if React's development double-invoke stops it mid-flight.
  useEffect(() => {
    const asked = peekHootQuestion(chatId);
    if (!asked) return;
    const t = setTimeout(() => {
      if (send(asked.text, asked.page)) clearHootQuestion(chatId);
    }, 0);
    return () => clearTimeout(t);
  }, [chatId, send]);

  const submit = useCallback(() => {
    if (send(input)) setInput("");
  }, [input, send]);

  const t = tickers[0] ?? "NVDA";
  const last = messages[messages.length - 1];

  return (
    <ResearchSources sources={sources} chatId={chatId}><div className="flex h-[calc(100vh-7rem)] min-h-[480px] gap-4">
      <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-6 text-center">
              <HootHero size={128} className="mx-auto mb-1" />
              <div className="text-sm font-medium">Ask for evidence, not conclusions</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Hoot pulls prices, SEC filings, financials, news, and your team&rsquo;s notes, with a source on every fact. It will not write your update or thesis.
              </p>
              <div className="mt-5 grid gap-2 text-left">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s.replaceAll("{T}", t))}
                    className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {s.replaceAll("{T}", t)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} live={m === last && status === "streaming"} trace={m === last && m.role === "assistant" ? traceView : null} now={now} />
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <HootSprite mood="thinking" size={32} bob /> Thinking…
            </div>
          )}
          {traceView && (status === "submitted" || last?.role !== "assistant") && (
            <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
              <TraceHeader view={traceView} now={now} />
            </div>
          )}
          {catchingUp && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Still working on the last question. The answer will appear here when it is ready; you can leave and come back.
            </div>
          )}
          {runError && <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">{runError}</div>}
          {requestError && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{requestError}</div>}
          <div ref={bottomRef} />
        </div>
        <form
          className="border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={configured ? (catchingUp ? "Waiting for the current answer…" : "Ask about a holding, a filing, a move…") : "Hoot is not configured: add OPENROUTER_API_KEY"}
              disabled={!configured || catchingUp}
              rows={2}
              className="min-h-10 resize-none"
            />
            {streaming ? (
              <Button type="button" variant="outline" size="icon" onClick={stopWatching} aria-label="Stop">
                <span className="size-2.5 rounded-sm bg-foreground" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim() || !configured || busy} aria-label="Send">
                <ArrowUp />
              </Button>
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Hover or focus a citation to preview its source. Red citations indicate an unavailable source.
          </div>
        </form>
      </div>

      <aside className="hidden w-72 shrink-0 flex-col rounded-lg border bg-card lg:flex">
        <div className="border-b px-3 py-2 text-xs font-semibold">Sources ({sources.size})</div>
        <div className="flex-1 overflow-y-auto p-2">
          {sources.size === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Sources returned by tools appear here.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...sources.values()].map((s) => (
                <li key={s.id} id={`src-${s.id}`}>
                  <Citation id={s.id} full />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div></ResearchSources>
  );
}

function Message({ message, live, trace, now }: { message: UIMessage; live: boolean; trace: TraceView | null; now: number }) {
  const isUser = message.role === "user";
  const meta = (message.metadata ?? {}) as { uncited?: number; page?: unknown };

  if (isUser) {
    const page = parsePageContext(meta.page);
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] space-y-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.parts.map((p, i) => (p.type === "text" ? <p key={i} className="whitespace-pre-wrap">{p.text}</p> : null))}
        </div>
        {page && page.kind !== "page" && (
          <Link href={page.path} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <Eye className="size-3" aria-hidden /> Asked from {pageContextLabel(page)}
          </Link>
        )}
      </div>
    );
  }

  const { activity, answer } = splitAssistantParts(message.parts);
  return (
    <div className="flex justify-start">
      <div className="w-full space-y-2">
        {(activity.length > 0 || trace) && <ActivityRow parts={activity} live={live && answer.length === 0} trace={trace} now={now} />}
        {answer.map((p, i) => (
          <ResearchAnswer key={i} text={p.text} />
        ))}
        {!live && meta.uncited !== undefined && meta.uncited > 0 && (
          <div className="text-[11px] text-warning-foreground">
            {meta.uncited} sentence{meta.uncited === 1 ? "" : "s"} with numbers carry no citation (heuristic). Check them against the sources.
          </div>
        )}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_quote: "Quote",
  get_price_history: "Price history",
  get_relative_moves: "Relative moves vs S&P",
  get_filings: "SEC filings",
  read_filing: "Read filing",
  list_filing_documents: "Filing documents",
  search_financial_concepts: "Search XBRL concepts",
  get_financials: "Financials",
  get_key_financials: "Key financials",
  get_news: "News",
  get_earnings_calendar: "Earnings calendar",
  get_team_context: "Team context",
  get_peer_moves: "Peer moves",
  find_documents: "Documents",
  search_documents: "Document passages",
  read_url: "Web page",
  search_web: "Web search",
  read_document: "Document",
  get_attribution: "Attribution",
  run_backtest: "Backtest",
};

const TOOL_PROGRESS: Record<string, string> = {
  get_quote: "Fetching quote",
  get_price_history: "Fetching price history",
  get_relative_moves: "Comparing moves with the S&P",
  get_filings: "Listing SEC filings",
  read_filing: "Reading filing",
  list_filing_documents: "Listing filing documents",
  search_financial_concepts: "Searching XBRL concepts",
  get_financials: "Pulling financials",
  get_key_financials: "Pulling key financials",
  get_news: "Scanning news",
  get_earnings_calendar: "Checking earnings calendar",
  get_team_context: "Reading team notes",
  get_peer_moves: "Checking peer moves",
  find_documents: "Searching indexed documents",
  search_documents: "Searching document text",
  read_url: "Reading a web page",
  search_web: "Searching the web",
  read_document: "Reading a document",
  get_attribution: "Reading the Fund's attribution",
  run_backtest: "Running a backtest",
};

/**
 * One line per turn summarising the research; expands to the individual lookups and any interim notes.
 * With a transparency trace, the expansion also shows each model step and every provider call under each lookup.
 */
export function ActivityRow({ parts, live, trace, now }: { parts: Part[]; live: boolean; trace: TraceView | null; now: number }) {
  const [open, setOpen] = useState(false);
  const { lookups, sources, failed, current } = summarizeActivity(parts);
  const running = live && (current !== null || lookups === 0);
  const liveDetail = running && trace ? latestLabel(trace) : null;
  const label = running
    ? current
      ? `${TOOL_PROGRESS[current] ?? current}…${liveDetail ? ` ${liveDetail}` : ""}`
      : `Working…${liveDetail ? ` ${liveDetail}` : ""}`
    : `Researched · ${lookups} lookup${lookups === 1 ? "" : "s"} · ${sources} source${sources === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`;

  // Insert a step divider before the first lookup of each model step; narration stays with the step it was written in.
  const rows: React.ReactNode[] = [];
  let currentStep = -1;
  const seenSteps = new Set<number>();
  parts.forEach((p, i) => {
    if (isToolPart(p)) {
      const step = trace?.stepOfCall.get(p.toolCallId);
      if (step !== undefined && step !== currentStep) {
        currentStep = step;
        seenSteps.add(step);
        rows.push(<StepDivider key={`step-${step}`} n={step} view={trace!} />);
      }
      rows.push(
        <div key={p.toolCallId ?? i} className="space-y-0.5">
          <ToolCard part={p} />
          {trace && <FetchRows events={trace.fetchesByCall.get(p.toolCallId) ?? []} end={trace.toolEnd.get(p.toolCallId)} />}
        </div>,
      );
    } else if (p.type === "text" && p.text.trim()) {
      rows.push(
        <p key={i} className="whitespace-pre-wrap px-0.5 italic text-muted-foreground">
          {p.text}
        </p>,
      );
    }
  });
  if (trace) {
    // Steps with no tool call (the written answer, or a step still in flight) go at the end.
    for (const n of [...trace.steps.keys()].sort((a, b) => a - b)) if (!seenSteps.has(n)) rows.push(<StepDivider key={`step-${n}`} n={n} view={trace} />);
    if (trace.looseFetches.length > 0) {
      rows.push(
        <div key="loose" className="space-y-0.5">
          <div className="px-0.5 text-[11px] text-muted-foreground">Outside any lookup</div>
          <FetchRows events={trace.looseFetches} />
        </div>,
      );
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-muted-foreground hover:text-foreground"
      >
        {running ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <Wrench className="size-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {trace && !open && (
        <div className="border-t px-2.5 py-1">
          <TraceHeader view={trace} now={now} />
        </div>
      )}
      {open && (
        <div className="space-y-1.5 border-t px-2.5 py-2">
          {trace && <TraceHeader view={trace} now={now} />}
          {rows}
        </div>
      )}
    </div>
  );
}

function ToolCard({ part }: { part: ToolPart }) {
  const name = toolName(part);
  const label = TOOL_LABELS[name] ?? name;
  const input =
    part.input && typeof part.input === "object"
      ? Object.entries(part.input as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(",") : String(v)}`)
          .join(" · ")
      : "";
  const done = toolDone(part);
  const errored = toolFailed(part);
  const n = part.output?.sources?.length ?? 0;
  return (
    <div className={cn("flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs", errored ? "border-destructive/30 text-destructive" : "text-muted-foreground")}>
      {done ? <Wrench className="size-3.5 shrink-0" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
      <span className="font-medium text-foreground">{label}</span>
      {input && <span className="truncate">{input}</span>}
      {errored && <span className="truncate">· {part.output?.error ?? part.errorText ?? "error"}</span>}
      {done && !errored && n > 0 && <span className="ml-auto shrink-0">{n} source{n === 1 ? "" : "s"}</span>}
    </div>
  );
}
