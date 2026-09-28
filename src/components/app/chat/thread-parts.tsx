"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowUp, ChevronRight, Eye, Loader2, Wrench } from "lucide-react";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/providers/types";
import { resolveSource } from "@/lib/agent/source-resolution";
import { pageContextLabel, type PageContext } from "@/lib/agent/page-context";
import { isToolPart, summarizeActivity, toolDone, toolFailed, toolName, type Part, type ToolPart } from "@/lib/agent/turn";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { HootOnPage } from "@/components/app/hoot/presence";
import { FetchRows, latestLabel, StepDivider, TraceHeader, type TraceView } from "./trace-panel";

// The pieces every research conversation is built from (general chats, holding boards, a sell-side call's chat).

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

/** Hoot, thinking, with what he's doing. While it shows, the corner companion steps aside. */
export function ThinkingRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-ink-2">
      <HootOnPage />
      <HootSprite mood="thinking" size={44} bob />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * One line per turn summarising the research, a round chip that expands to the individual lookups and any interim
 * notes. While the turn is still researching it reads as the tool in flight; with `thinking` that live state shows
 * as the thinking Hoot instead of a spinner. With a transparency trace, the expansion also shows each model step
 * and every provider call under each lookup.
 */
export function ActivityRow({ parts, live, trace, now, thinking = false }: { parts: Part[]; live: boolean; trace: TraceView | null; now: number; thinking?: boolean }) {
  const [open, setOpen] = useState(false);
  const { lookups, sources, failed, current } = summarizeActivity(parts);
  // Live with no answer yet covers the gaps between lookups and the wait for the answer (or its write-up).
  const running = live;
  const liveDetail = running && trace ? latestLabel(trace) : null;
  const label = running
    ? current
      ? `${TOOL_PROGRESS[current] ?? current}…${liveDetail ? ` ${liveDetail}` : ""}`
      : `Working…${liveDetail ? ` ${liveDetail}` : ""}`
    : `Researched · ${lookups} lookup${lookups === 1 ? "" : "s"} · ${sources} source${sources === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`;

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
  const expandable = rows.length > 0 || trace !== null;

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {running && thinking ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={!expandable} className="group text-left">
          <ThinkingRow>
            <span className="inline-flex items-center gap-1 group-hover:text-foreground">
              {label}
              {expandable && <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />}
            </span>
          </ThinkingRow>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex max-w-full items-center gap-2 rounded-full bg-band px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:text-foreground"
        >
          {running ? <Loader2 className="size-[13px] shrink-0 animate-spin" /> : <Wrench className="size-[13px] shrink-0" />}
          <span className="min-w-0 truncate">{label}</span>
          <ChevronRight className={cn("size-[13px] shrink-0 transition-transform", open && "rotate-90")} />
        </button>
      )}
      {trace && !open && (
        <div className="px-1">
          <TraceHeader view={trace} now={now} />
        </div>
      )}
      {open && (
        <div className="w-full space-y-1.5 rounded-[10px] bg-background p-2.5 text-xs shadow-[0_0_0_1px_var(--border)]">
          {trace && <TraceHeader view={trace} now={now} />}
          {rows.length > 0 ? rows : <p className="px-0.5 text-muted-foreground">No lookups yet.</p>}
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
    <div className={cn("flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-xs shadow-[0_0_0_1px_var(--border)]", errored ? "text-destructive" : "text-muted-foreground")}>
      {done ? <Wrench className="size-3.5 shrink-0" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
      <span className="font-medium text-foreground">{label}</span>
      {input && <span className="truncate">{input}</span>}
      {errored && <span className="truncate">· {part.output?.error ?? part.errorText ?? "error"}</span>}
      {done && !errored && n > 0 && <span className="ml-auto shrink-0 font-mono text-[11px]">{n} source{n === 1 ? "" : "s"}</span>}
    </div>
  );
}

/** The member's question: ink bubble on the right, with where it was asked from when Hoot was handed a page. */
export function UserBubble({ children, page }: { children: ReactNode; page?: PageContext | null }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[min(500px,85%)] space-y-2 rounded-[16px_16px_4px_16px] bg-primary px-3.5 py-2.5 text-sm leading-normal text-primary-foreground [&_p]:whitespace-pre-wrap">{children}</div>
      {page && page.kind !== "page" && (
        <Link href={page.path} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <Eye className="size-3" aria-hidden /> Asked from {pageContextLabel(page)}
        </Link>
      )}
    </div>
  );
}

/** Where a job, not a member, asked (a call brief): a quiet label in place of the question bubble. */
export function PromptLabel({ children }: { children: ReactNode }) {
  return <div className="text-[12px] font-medium text-muted-foreground">{children}</div>;
}

/** The conversation's header row: ticker, title and meta on the left, actions (Trace, etc.) on the right. */
export function ThreadHeader({ ticker, title, meta, children }: { ticker?: string; title: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-7">
      {ticker && <span className="font-mono text-[13.5px] font-semibold">{ticker}</span>}
      <h2 className="min-w-0 shrink truncate text-sm font-semibold">{title}</h2>
      {meta && <span className="min-w-0 shrink-[4] truncate text-[12.5px] text-muted-foreground">{meta}</span>}
      <span className="flex-1" />
      {children && <div className="flex shrink-0 items-center gap-3.5 text-[12.5px] text-muted-foreground">{children}</div>}
    </div>
  );
}


/** A caution or error note inside the thread. */
export function ThreadNote({ tone, children }: { tone: "caution" | "error" | "muted"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-3 py-2 text-[13px]",
        tone === "caution" && "bg-caution text-caution-foreground",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "muted" && "flex items-center gap-2 bg-band text-ink-2",
      )}
    >
      {children}
    </div>
  );
}

/** The question box: radius 16, what Hoot can see, a round send (or stop) button, and the learning boundary under it. */
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
  /** A muted note in the chip row when there's no page to show. */
  hint?: ReactNode;
}) {
  return (
    <form
      className="shrink-0 border-t px-6 pt-3.5 pb-[18px] xl:px-14"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <ComposerBox>
        <textarea
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
          aria-label="Question"
          className="field-sizing-content max-h-40 min-h-[22px] w-full resize-none bg-transparent text-sm leading-[22px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <div className="flex items-center gap-2">
          {sees ? <SeesChip>{sees}</SeesChip> : hint ? <span className="min-w-0 truncate text-xs text-muted-foreground">{hint}</span> : null}
          <span className="flex-1" />
          {streaming && onStop ? (
            <button type="button" onClick={onStop} aria-label="Stop" className="grid size-8 shrink-0 place-items-center rounded-full bg-card shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--border-strong)]">
              <span className="size-2.5 rounded-sm bg-foreground" />
            </button>
          ) : (
            <SendButton disabled={disabled || sendDisabled || !value.trim()} />
          )}
        </div>
      </ComposerBox>
    </form>
  );
}

export function ComposerBox({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5 rounded-2xl bg-background px-3.5 py-3 shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--ring)]">{children}</div>;
}

export function SeesChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-[5px] rounded-full bg-muted px-2.5 py-[3px] text-xs text-ink-2">
      <Eye className="size-3 shrink-0" aria-hidden />
      <span className="truncate">Hoot can see: {children}</span>
    </span>
  );
}

export function SendButton({ disabled, label = "Send" }: { disabled: boolean; label?: string }) {
  return (
    <button type="submit" disabled={disabled} aria-label={label} className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-40">
      <ArrowUp className="size-[15px]" />
    </button>
  );
}

/** "Thu 24 Sep" ("24 Sep 2025" in another year); an unreadable date is shown as given. */
export function shortDate(iso: string | undefined | null) {
  if (!iso) return null;
  return fmtDay(iso) || iso.slice(0, 10);
}

/** Hoot's pink footnote number. */
export function SourceNumber({ n, className }: { n: number | string; className?: string }) {
  return <span className={cn("grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-hoot px-1 font-mono text-[10.5px] font-medium text-hoot-foreground", className)}>{n}</span>;
}

/**
 * One source in the right-hand list: pink number, title, "publisher · date". A web source opens in a new tab;
 * a document opens in the source viewer.
 */
export function SourceListCard({ n, source, onView }: { n: number; source: Source; onView: (s: Source) => void }) {
  const target = resolveSource(source);
  const title = source.title?.trim() || "Untitled source";
  const meta = [source.publisher || "Publisher unavailable", shortDate(source.publishedAt)].filter(Boolean).join(" · ");
  const body = (
    <>
      <SourceNumber n={n} className={target.kind === "unavailable" ? "bg-destructive/10 text-destructive" : undefined} />
      <span className="min-w-0">
        <span className="block text-[13px] leading-[1.35]">{title}</span>
        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
          {meta}
          {target.kind === "unavailable" && " · unavailable"}
        </span>
      </span>
    </>
  );
  const cls = "flex w-full gap-2.5 rounded-[10px] bg-card px-3 py-[9px] text-left shadow-[0_0_0_1px_var(--border)] transition-shadow hover:shadow-[0_0_0_1px_var(--border-strong)]";
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

/** The right column's heading: "Sources" and a mono count. */
export function SourcesHeading({ count, sub }: { count: number; sub?: string }) {
  return (
    <div className="shrink-0">
      <div className="flex items-baseline">
        <h2 className="flex-1 text-sm font-semibold">Sources</h2>
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
