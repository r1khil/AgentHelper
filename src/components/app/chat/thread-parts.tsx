"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowUp, ChevronRight, Eye, Loader2 } from "lucide-react";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/providers/types";
import { resolveSource } from "@/lib/agent/source-resolution";
import { pageContextLabel, type PageContext } from "@/lib/agent/page-context";
import { workedFor } from "@/lib/agent/board";
import { isToolPart, summarizeActivity, toolDone, toolFailed, toolName, type Part, type ToolPart } from "@/lib/agent/turn";
import { OwlMark } from "@/components/app/owl-mark";
import { FetchRows, latestLabel, StepDivider, TraceHeader, type TraceView } from "./trace-panel";
import { COMPOSER_SHADOW } from "./styles";

// The pieces every research conversation is built from (a Hoot thread, a holding's board, the answer panel, a
// sell-side call's chat): Hoot's face and what he did, the member's question, the question box, the source rows.

const TOOL_LABELS: Record<string, string> = {
  get_quote: "Quote",
  get_price_history: "Price history",
  get_relative_moves: "Relative moves vs S&P",
  get_filings: "SEC filings",
  read_filing: "Read filing",
  list_filing_documents: "Filing documents",
  search_financial_concepts: "Find reported line items",
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
  get_daily_performance: "Daily performance",
  run_backtest: "Backtest",
  get_portfolio_risk: "Portfolio risk",
  get_macro_series: "Economic data (FRED)",
  get_company_background: "Company background",
  get_market_odds: "Prediction markets",
  run_python: "Python calculation",
  compare_peers: "Peer comparison",
  get_insider_transactions: "Insider trades",
  get_institutional_holders: "Institutional holders",
  get_analyst_estimates: "Analyst estimates",
  find_call_transcripts: "Call transcripts",
  read_call_transcript: "Read call transcript",
  remember: "Research log",
  recall: "Research log",
};

const TOOL_PROGRESS: Record<string, string> = {
  get_quote: "Fetching quote",
  get_price_history: "Fetching price history",
  get_relative_moves: "Comparing moves with the S&P",
  get_filings: "Listing SEC filings",
  read_filing: "Reading filing",
  list_filing_documents: "Listing filing documents",
  search_financial_concepts: "Finding reported line items",
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
  get_daily_performance: "Reading today's performance",
  run_backtest: "Running a backtest",
  get_portfolio_risk: "Reading the portfolio's risk",
  get_macro_series: "Pulling economic data from FRED",
  get_company_background: "Looking up company background",
  get_market_odds: "Checking prediction-market odds",
  run_python: "Running a Python calculation",
  compare_peers: "Comparing peers",
  get_insider_transactions: "Checking insider trades",
  get_institutional_holders: "Checking institutional holders",
  get_analyst_estimates: "Pulling analyst estimates",
  find_call_transcripts: "Finding call transcripts",
  read_call_transcript: "Reading a call transcript",
  remember: "Noting it in the research log",
  recall: "Checking the research log",
};

/** Hoot's face in the conversation's flow: 26px unless a class says otherwise. */
export function HootFace({ className }: { className?: string }) {
  return <OwlMark className={cn("size-[26px] rounded-full", className)} />;
}

/** Hoot, working on the question: his face, breathing, with what he's doing. */
export function ThinkingRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-body text-ink-2", className)}>
      <HootFace className="motion-safe:animate-pulse" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** What Hoot did for one answer, in a sentence: "worked for 12s, read 4 sources". */
export function workedLine({ lookups, sources, failed }: { lookups: number; sources: number; failed: number }, elapsedMs?: number | null) {
  const took = elapsedMs ? `worked for ${workedFor(elapsedMs)}` : `${lookups} lookup${lookups === 1 ? "" : "s"}`;
  return `${took}, read ${sources} source${sources === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`;
}

/**
 * The line above an answer that says what Hoot did, and opens to the individual lookups and any interim notes. While
 * the turn is still researching it reads as the lookup in flight; with a transparency trace the opened list also shows
 * each model step and every provider call under each lookup. `variant` picks the drawing: the thread puts Hoot's face
 * and name in front of it, the board and the panel keep it a grey 12px line.
 */
export function ActivityRow({
  parts,
  live,
  trace,
  now,
  variant = "board",
  elapsedMs,
  open: openProp,
  onOpenChange,
}: {
  parts: Part[];
  live: boolean;
  trace: TraceView | null;
  now: number;
  variant?: "thread" | "board" | "panel";
  /** How long the turn took, when known. */
  elapsedMs?: number | null;
  /** Controlled open state, for a "Show trace" button elsewhere in the turn. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOwn(v));
  const summary = summarizeActivity(parts);
  const { current } = summary;
  // Live with no answer yet covers the gaps between lookups and the wait for the answer (or its write-up).
  const liveDetail = live && trace ? latestLabel(trace) : null;
  const label = live
    ? current
      ? `${TOOL_PROGRESS[current] ?? current}…${liveDetail ? ` ${liveDetail}` : ""}`
      : `Working…${liveDetail ? ` ${liveDetail}` : ""}`
    : workedLine(summary, elapsedMs);

  // Insert a step divider before the first lookup of each model step; narration stays with the step it was written in.
  const rows: ReactNode[] = [];
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
        <div key={p.toolCallId ?? i}>
          <ToolRow part={p} />
          {trace && <FetchRows events={trace.fetchesByCall.get(p.toolCallId) ?? []} end={trace.toolEnd.get(p.toolCallId)} />}
        </div>,
      );
    } else if (p.type === "text" && p.text.trim()) {
      rows.push(
        <p key={i} className="py-1.5 whitespace-pre-wrap text-muted-foreground italic">
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
        <div key="loose">
          <div className="pt-1.5 text-caption text-muted-foreground">Outside any lookup</div>
          <FetchRows events={trace.looseFetches} />
        </div>,
      );
    }
  }
  const expandable = rows.length > 0 || trace !== null;
  const thread = variant === "thread";
  const toggle = (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      disabled={!expandable}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-sm text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:hover:text-foreground",
        thread ? "text-body text-ink-2" : "text-caption text-muted-foreground",
      )}
    >
      {thread && "· "}
      {live && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />}
      <span className="min-w-0 truncate">{thread ? label : capitalize(label)}</span>
      {expandable && <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} aria-hidden />}
    </button>
  );

  return (
    <div className="flex w-full flex-col items-start">
      {thread ? (
        <div className="flex items-center gap-2 text-body text-ink-2">
          <HootFace className={cn(live && "motion-safe:animate-pulse")} />
          <b className="font-semibold text-foreground">Hoot</b>
          {toggle}
        </div>
      ) : (
        toggle
      )}
      {trace && !open && (
        <div className="pt-1">
          <TraceHeader view={trace} now={now} />
        </div>
      )}
      {open && (
        <div className="mt-2 w-full space-y-0.5 border-y py-1.5 text-body">
          {trace && <TraceHeader view={trace} now={now} />}
          {rows.length > 0 ? rows : <p className="py-1 text-muted-foreground">No lookups yet.</p>}
        </div>
      )}
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ToolRow({ part }: { part: ToolPart }) {
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
    <div className={cn("flex items-center gap-2 border-b border-row py-1.5 text-body last:border-b-0", errored ? "text-caution-foreground" : "text-muted-foreground")}>
      {!done && <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />}
      <span className="font-medium text-foreground">{label}</span>
      {input && <span className="truncate">{input}</span>}
      {errored && <span className="truncate">· failed: {part.output?.error ?? part.errorText ?? "error"}</span>}
      {done && !errored && n > 0 && (
        <span className="ml-auto shrink-0 text-caption">
          {n} source{n === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

/** The member's question: a grey bubble on the right, with where it was asked from when Hoot was handed a page. */
export function UserBubble({ children, page, size = "lg" }: { children: ReactNode; page?: PageContext | null; size?: "lg" | "sm" }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={cn(
          "space-y-2 rounded-xl bg-secondary text-foreground [&_p]:whitespace-pre-wrap",
          size === "lg" ? "max-w-[520px] px-3.5 py-2.5 text-emph" : "max-w-[420px] px-3 py-2 text-body",
        )}
      >
        {children}
      </div>
      {page && page.kind !== "page" && (
        <Link href={page.path} className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground">
          <Eye className="size-3" aria-hidden /> Asked from {pageContextLabel(page)}
        </Link>
      )}
    </div>
  );
}

/** Where a job, not a member, asked (a call brief): a quiet label in place of the question bubble. */
export function PromptLabel({ children }: { children: ReactNode }) {
  return <div className="text-body font-medium text-muted-foreground">{children}</div>;
}

/** A failure or a wait inside the thread: plain words, amber when something went wrong (red is only down or overdue). */
export function ThreadNote({ tone, children }: { tone: "caution" | "error" | "muted"; children: ReactNode }) {
  return <div className={cn("text-body", tone === "muted" ? "flex items-center gap-2 text-ink-2" : "font-medium text-caution-foreground")}>{children}</div>;
}

export type ComposerVariant = "thread" | "compact";

/**
 * The question box under a conversation. `thread` is the follow-up box under a full thread (12px radius, the soft
 * two-layer shadow, a 34px send); `compact` is the board's and the panel's (10px radius, a 30px send). What Hoot can
 * see sits in the box, in grey; a stop button takes the send button's place while an answer streams.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming = false,
  disabled,
  sendDisabled,
  placeholder,
  sees,
  hint,
  variant = "thread",
  inputRef,
  label = "Ask a follow-up",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled: boolean;
  sendDisabled?: boolean;
  placeholder: string;
  /** "Hoot can see: …" */
  sees?: string | null;
  /** A muted note beside the send button when there's no page to show. */
  hint?: ReactNode;
  variant?: ComposerVariant;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  label?: string;
}) {
  const thread = variant === "thread";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className={cn(
        "flex items-center gap-2 border border-border-strong bg-background focus-within:border-foreground",
        thread ? cn("w-full rounded-xl py-2 pr-2 pl-4", COMPOSER_SHADOW) : "rounded-[10px] py-1.5 pr-1.5 pl-3",
      )}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label={label}
        className={cn(
          "field-sizing-content max-h-40 min-w-0 flex-1 resize-none bg-transparent leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60",
          thread ? "min-h-6 py-[5px] text-emph" : "min-h-5 py-0.5 text-body",
        )}
      />
      {sees ? (
        <span className="inline-flex min-w-0 max-w-[40%] items-center gap-1 text-caption text-muted-foreground">
          <Eye className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Hoot can see: {sees}</span>
        </span>
      ) : hint ? (
        <span className="min-w-0 truncate text-caption text-muted-foreground">{hint}</span>
      ) : null}
      {streaming && onStop ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          className={cn("grid shrink-0 place-items-center bg-secondary hover:bg-border", thread ? "size-[34px] rounded-lg" : "size-[30px] rounded-[7px]")}
        >
          <span className="size-2.5 rounded-sm bg-foreground" />
        </button>
      ) : (
        <SendButton disabled={disabled || sendDisabled || !value.trim()} size={thread ? "lg" : "sm"} />
      )}
    </form>
  );
}

/** The frame of a big question box (Home, Research): kept here so the thread's follow-up and the first question look alike. */
export function ComposerBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col rounded-xl border border-border-strong bg-background px-4 pt-4 pb-3 focus-within:border-foreground", COMPOSER_SHADOW, className)}>{children}</div>
  );
}

export function SendButton({ disabled, label = "Send", size = "lg" }: { disabled: boolean; label?: string; size?: "lg" | "sm" }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center bg-primary text-primary-foreground transition-opacity hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40",
        size === "lg" ? "size-[34px] rounded-lg" : "size-[30px] rounded-[7px]",
      )}
    >
      <ArrowUp className={size === "lg" ? "size-[15px]" : "size-3.5"} strokeWidth={2} aria-hidden />
    </button>
  );
}

/** "Thu, Sep 24" ("Sep 24, 2025" in another year); an unreadable date is shown as given. */
export function shortDate(iso: string | undefined | null) {
  if (!iso) return null;
  return fmtDay(iso) || iso.slice(0, 10);
}

/** A source's number: a plain 12px figure, like the citation that points to it. */
export function SourceNumber({ n, className }: { n: number | string; className?: string }) {
  return <b className={cn("shrink-0 text-caption font-semibold", className)}>{n}</b>;
}

/**
 * One source in a list beside the thread: its number, its title and "publisher · date", on a hairline row. A web source
 * opens in a new tab; a document opens in the source viewer.
 */
export function SourceListCard({ n, source, onView }: { n: number; source: Source; onView: (s: Source) => void }) {
  const target = resolveSource(source);
  const title = source.title?.trim() || "Untitled source";
  const meta = [source.publisher || "Publisher unavailable", shortDate(source.publishedAt)].filter(Boolean).join(" · ");
  const body = (
    <>
      <SourceNumber n={n} className={target.kind === "unavailable" ? "text-caution-foreground" : undefined} />
      <span className="min-w-0">
        <span className="block">{title}</span>
        <span className="block text-muted-foreground">
          {meta}
          {target.kind === "unavailable" && <span className="text-caution-foreground"> · unavailable</span>}
        </span>
      </span>
    </>
  );
  const cls = "grid w-full grid-cols-[16px_minmax(0,1fr)] gap-1.5 border-b border-row py-[7px] text-left text-caption hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
  return target.kind === "external" ? (
    <a href={target.href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`[${n}] ${title} (opens in a new tab)`}>
      {body}
    </a>
  ) : (
    <button type="button" className={cls} onClick={() => onView(source)} aria-label={`[${n}] ${target.kind === "unavailable" ? "Source unavailable" : title}`}>
      {body}
    </button>
  );
}

/** A side column's heading, in the 13px bold the artboards give the board's columns. */
export function SideHeading({ children, count, className }: { children: ReactNode; count?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline", className)}>
      <h2 className="flex-1 text-body font-bold">{children}</h2>
      {count !== undefined && <span className="text-caption text-muted-foreground">{count}</span>}
    </div>
  );
}

/** The right column's heading for a chat's sources: "Sources" and a count. */
export function SourcesHeading({ count, sub }: { count: number; sub?: string }) {
  return (
    <div className="shrink-0">
      <SideHeading count={count}>Sources</SideHeading>
      {sub && <div className="mt-0.5 text-caption text-muted-foreground">{sub}</div>}
    </div>
  );
}
