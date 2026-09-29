"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Flag, Plus } from "lucide-react";
import type { Source } from "@/lib/providers/types";
import type { Turn, TurnSource } from "@/lib/agent/board";
import { answerForCopy, savedTurnMs } from "@/lib/agent/board";
import { resolveSource, sourceType } from "@/lib/agent/source-resolution";
import { turnPageLinks } from "@/lib/agent/turn-links";
import { cn } from "@/lib/utils";
import { proposalsOf } from "@/lib/hoot/proposals";
import type { Part } from "@/lib/agent/turn";
import { PinToBoard, type PinTarget } from "./pin-to-board";
import { ProposalCard } from "./proposal-card";
import { ResearchAnswer, ResearchSources, useSourceViewer, type CitationLinks } from "./research-answer";
import { ActivityRow, PromptLabel, shortDate, UserBubble } from "./thread-parts";
import type { TraceView } from "./trace-panel";

export type TurnVariant = "thread" | "board" | "panel";

/** What one question and its answer need from the conversation around them. */
export type TurnViewProps = {
  turn: Turn;
  variant: TurnVariant;
  chatId: string;
  /** Every source the chat has retrieved, and the numbers this answer gives its own (they restart at 1). */
  allSources: Map<string, Source>;
  sources: TurnSource[];
  /** The answer is still being written. */
  live: boolean;
  /** Reloading a run that continued while the page was away: no "stopped" note until it lands. */
  catchingUp?: boolean;
  trace?: TraceView | null;
  now: number;
  /** How long this page saw the turn take, until the saved answer carries its own time. */
  elapsedMs?: number | null;
  /** The chat's team, for "Open in Risk" on a team-scope lookup that left the team to default. */
  teamSlug: string | null;
  /** A general conversation can be pinned to a holding's board. */
  pin?: { chatId: string; targets: PinTarget[]; onPinned?: () => void } | null;
  /** Put "check this number" into the question box. */
  onFlag?: () => void;
  /** Suggested next questions, under the last answer. */
  related?: string[];
  onAsk?: (question: string) => void;
  /** Board: citations point at the side column's rows instead of cards under the answer. */
  links?: CitationLinks;
  className?: string;
};

/**
 * One question and its answer, as the conversation pages draw it: the question as a grey bubble, what Hoot did (one
 * line that opens to the lookups and the trace), the sources it read, the answer in his serif with numbered citations,
 * the pages behind the numbers, and what you can do with it (copy, flag a number, pin, show the trace). `variant` picks
 * the frame: a full thread (source cards in a row), the board (sources live in its side column) or the answer panel
 * (sources as a short numbered list).
 */
export function TurnView(props: TurnViewProps) {
  const { turn, variant, chatId, allSources, sources, live, catchingUp, trace = null, now, teamSlug, pin, onFlag, related, onAsk } = props;
  const numbers = useMemo(() => new Map(sources.map((r) => [r.source.id, r.n])), [sources]);
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [showTrace, setShowTrace] = useState(false);
  const anchor = (id: string) => `src-${turn.id}-${id}`;

  const links = useMemo<CitationLinks>(
    () =>
      props.links ?? {
        anchor,
        onCite: (id) => {
          setOpen(new Set([id]));
          document.getElementById(anchor(id))?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        },
        onHover: setHover,
        openIds: open,
        highlight: hover,
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.links, open, hover, turn.id],
  );

  const meta = (turn.assistant?.metadata ?? {}) as { uncited?: number };
  const elapsed = props.elapsedMs ?? savedTurnMs(turn);
  const pages = live ? [] : turnPageLinks(turn.activity, teamSlug);
  // Changes Hoot proposed in this answer, each a card the member confirms or cancels. Inert data: never applied here.
  const proposals = useMemo(() => proposalsOf((turn.assistant?.parts ?? []) as Part[]), [turn.assistant]);
  const sm = variant !== "thread";

  return (
    <ResearchSources sources={allSources} numbers={numbers} links={links} chatId={chatId}>
      <div className={cn("flex flex-col", props.className)}>
        {turn.label ? (
          <PromptLabel>{turn.label}</PromptLabel>
        ) : (
          <UserBubble page={turn.page} size={sm ? "sm" : "lg"}>
            <p>{turn.question}</p>
          </UserBubble>
        )}

        {turn.assistant && (turn.activity.length > 0 || live || trace) ? (
          <div className={cn(variant === "thread" ? "mt-6" : variant === "panel" ? "mt-[18px]" : "mt-4")} onClick={(e) => e.stopPropagation()}>
            <ActivityRow parts={turn.activity} live={live && !turn.answerText} trace={trace} now={now} variant={variant} elapsedMs={elapsed} open={showTrace} onOpenChange={setShowTrace} />
          </div>
        ) : null}

        {variant === "thread" && sources.length > 0 && <SourceCards turnId={turn.id} rows={sources} open={open} hover={hover} onHover={setHover} anchor={anchor} />}

        {turn.answerText ? (
          <div className={cn(variant === "thread" ? "mt-[22px]" : variant === "panel" ? "mt-2" : "mt-1.5")}>
            <ResearchAnswer text={turn.answerText} className={cn(variant === "thread" && "leading-[29px] [&_p+p]:mt-3.5", variant === "panel" && "[&_p+p]:mt-3")} />
          </div>
        ) : turn.assistant && !live && !catchingUp ? (
          <div className="mt-2 text-body font-medium text-caution-foreground">
            Hoot stopped before writing an answer.{variant === "board" ? " Its lookups are on the right; ask again to get a written answer." : " Ask again to get a written answer."}
          </div>
        ) : null}

        {proposals.map((p) => (
          <ProposalCard key={p.toolCallId} chatId={chatId} toolCallId={p.toolCallId} proposal={p.proposal} outcome={p.outcome} compact={sm} />
        ))}

        {variant === "panel" && sources.length > 0 && <SourceList rows={sources} open={open} hover={hover} onHover={setHover} anchor={anchor} />}

        {turn.answerText && !live && pages.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {pages.map((p) => (
              <Link key={p.href} href={p.href} className="text-caption font-semibold text-foreground underline-offset-2 hover:underline">
                Open in {p.label}
              </Link>
            ))}
          </div>
        )}

        {turn.answerText && !live && (
          <AnswerActions
            variant={variant}
            text={answerForCopy(turn.answerText, numbers)}
            unsourced={meta.uncited ?? 0}
            onFlag={onFlag}
            pin={pin}
            traceOpen={showTrace}
            onToggleTrace={() => setShowTrace((v) => !v)}
          />
        )}

        {!live && related && related.length > 0 && onAsk && <Related variant={variant} questions={related} onAsk={onAsk} />}
      </div>
    </ResearchSources>
  );
}

/** What a card calls its source: the fund's own pages are "Fund data", the rest by kind ("SEC filing", "Web page"). */
export function cardKind(s: Source) {
  return /^Owl Fund/.test(s.publisher) ? "Fund data" : sourceType(s);
}

/** A row of numbered source cards under Hoot's line, in the order the answer numbers them. */
function SourceCards({ turnId, rows, open, hover, onHover, anchor }: { turnId: string; rows: TurnSource[]; open: ReadonlySet<string>; hover: string | null; onHover: (id: string | null) => void; anchor: (id: string) => string }) {
  const view = useSourceViewer();
  return (
    <div aria-label="Sources" data-turn={turnId} className="mt-3.5 grid grid-cols-4 gap-2">
      {rows.map(({ source: s, n }) => {
        const target = resolveSource(s);
        const unavailable = target.kind === "unavailable";
        const kind = unavailable ? "Unavailable" : cardKind(s);
        const title = unavailable && !s.title?.trim() ? "Source unavailable" : (s.title?.trim() ?? "Untitled source");
        const active = open.has(s.id) || hover === s.id;
        const body = (
          <>
            <span className={cn("truncate text-caption", unavailable ? "font-semibold text-caution-foreground" : "text-muted-foreground")}>
              {n} · {kind}
            </span>
            <span className="line-clamp-2 min-h-9 text-body">{title}</span>
            <span className="truncate text-caption text-muted-foreground">{[s.publisher || "Publisher unavailable", shortDate(s.publishedAt)].filter(Boolean).join(" · ")}</span>
          </>
        );
        const cls = cn(
          "flex min-w-0 flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          unavailable ? "border-caution-foreground" : active ? "border-foreground" : "border-border hover:border-border-strong",
        );
        const common = { id: anchor(s.id), onMouseEnter: () => onHover(s.id), onMouseLeave: () => onHover(null), className: cls };
        return target.kind === "external" ? (
          <a key={s.id} href={target.href} target="_blank" rel="noopener noreferrer" aria-label={`[${n}] ${title} (opens in a new tab)`} {...common}>
            {body}
          </a>
        ) : target.kind === "document" ? (
          <button key={s.id} type="button" onClick={() => view(s)} aria-label={`[${n}] ${title}`} {...common}>
            {body}
          </button>
        ) : (
          <div key={s.id} {...common}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** The panel's sources: a numbered hairline list, title and publisher. */
function SourceList({ rows, open, hover, onHover, anchor }: { rows: TurnSource[]; open: ReadonlySet<string>; hover: string | null; onHover: (id: string | null) => void; anchor: (id: string) => string }) {
  const view = useSourceViewer();
  return (
    <div className="mt-1 flex flex-col">
      {rows.map(({ source: s, n }) => {
        const target = resolveSource(s);
        const unavailable = target.kind === "unavailable";
        const title = s.title?.trim() || "Untitled source";
        const cls = cn(
          "flex items-baseline gap-2.5 border-t border-row py-2 text-left text-body last:border-b focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
          (open.has(s.id) || hover === s.id) && "bg-band",
        );
        const inner = (
          <>
            <b className={cn("w-3.5 shrink-0 font-semibold", unavailable && "text-caution-foreground")}>{n}</b>
            <span className="min-w-0 flex-1">{title}</span>
            <span className={cn("shrink-0 text-caption", unavailable ? "font-semibold text-caution-foreground" : "text-muted-foreground")}>{unavailable ? "Unavailable" : s.publisher}</span>
          </>
        );
        const common = { id: anchor(s.id), onMouseEnter: () => onHover(s.id), onMouseLeave: () => onHover(null), className: cls };
        return target.kind === "external" ? (
          <a key={s.id} href={target.href} target="_blank" rel="noopener noreferrer" aria-label={`[${n}] ${title} (opens in a new tab)`} {...common}>
            {inner}
          </a>
        ) : target.kind === "document" ? (
          <button key={s.id} type="button" onClick={() => view(s)} {...common}>
            {inner}
          </button>
        ) : (
          <div key={s.id} {...common}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function AnswerActions({
  variant,
  text,
  unsourced,
  onFlag,
  pin,
  traceOpen,
  onToggleTrace,
}: {
  variant: TurnVariant;
  text: string;
  unsourced: number;
  onFlag?: () => void;
  pin?: { chatId: string; targets: PinTarget[]; onPinned?: () => void } | null;
  traceOpen?: boolean;
  /** "Show trace" under the answer; a thread has a Steps tab instead. */
  onToggleTrace?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable; nothing to undo */
    }
  };
  const unsourcedWord = unsourced > 0 && (
    <span
      className="font-semibold text-caution-foreground"
      title="Counted automatically from lines that state a number without a source marker, so the count can be off by a few. Check it before relying on it."
    >
      {unsourced} unsourced {unsourced === 1 ? "number" : "numbers"}
    </span>
  );

  if (variant === "panel") {
    const icon = "grid size-[30px] place-items-center rounded-md text-ink-2 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-1 text-ink-2">
        <button type="button" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy"} title={copied ? "Copied" : "Copy"} className={icon}>
          {copied ? <Check className="size-[15px]" aria-hidden /> : <Copy className="size-[15px]" aria-hidden />}
        </button>
        {onFlag && (
          <button type="button" onClick={onFlag} aria-label="Flag a wrong number" title="Flag a wrong number" className={icon}>
            <Flag className="size-[15px]" aria-hidden />
          </button>
        )}
        {unsourcedWord && <span className="ml-1 text-caption">{unsourcedWord}</span>}
        <span className="flex-1" />
        {pin && <PinToBoard chatId={pin.chatId} targets={pin.targets} look="button" onPinned={pin.onPinned} />}
      </div>
    );
  }

  const link = "rounded-sm text-ink-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-caption">
      {unsourcedWord}
      <button type="button" onClick={() => void copy()} className={link}>
        {copied ? "Copied" : "Copy"}
      </button>
      {onFlag && (
        <button type="button" onClick={onFlag} className={link}>
          Flag a wrong number
        </button>
      )}
      {pin && <PinToBoard chatId={pin.chatId} targets={pin.targets} className={link} onPinned={pin.onPinned} />}
      {onToggleTrace && (
        <button type="button" onClick={onToggleTrace} aria-pressed={traceOpen} className={link}>
          {traceOpen ? "Hide trace" : "Show trace"}
        </button>
      )}
    </div>
  );
}

/** The next questions Hoot noted after answering: "Related" under a thread, "Ask next" in the panel. */
export function Related({ variant, questions, onAsk }: { variant: TurnVariant; questions: string[]; onAsk: (q: string) => void }) {
  const panel = variant === "panel";
  const Icon = panel ? ArrowRight : Plus;
  return (
    <section aria-label={panel ? "Ask next" : "Related"}>
      {panel ? (
        <div className="mt-[18px] text-caption font-semibold text-muted-foreground">Ask next</div>
      ) : (
        <h2 className="mt-[26px] border-b pb-1.5 text-emph font-semibold">Related</h2>
      )}
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onAsk(q)}
          className={cn(
            "flex w-full items-center justify-between gap-3 border-b border-row text-left transition-colors hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
            panel ? "py-[9px] text-body" : "min-h-[46px] border-border py-2 text-emph",
          )}
        >
          <span className="min-w-0">{q}</span>
          <Icon className={cn("shrink-0 text-muted-foreground", panel ? "size-3" : "size-4")} strokeWidth={2} aria-hidden />
        </button>
      ))}
    </section>
  );
}
