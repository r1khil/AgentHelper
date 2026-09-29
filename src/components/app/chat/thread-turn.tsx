"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import type { Source } from "@/lib/providers/types";
import type { Turn, TurnSource } from "@/lib/agent/board";
import { answerForCopy, savedTurnMs } from "@/lib/agent/board";
import { pageContextLabel } from "@/lib/agent/page-context";
import { resolveSource } from "@/lib/agent/source-resolution";
import { turnPageLinks } from "@/lib/agent/turn-links";
import { summarizeActivity, type Part } from "@/lib/agent/turn";
import { proposalsOf } from "@/lib/hoot/proposals";
import { fmtDateTime, fmtDay, fmtTime, readableTitle } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tabs, tabPanelProps } from "@/components/app/tabs";
import { ProposalCard } from "./proposal-card";
import { ResearchAnswer, ResearchSources, useSourceViewer } from "./research-answer";
import { activityLabel, activityRows, capitalize, HootFace, shortDate, workedLine } from "./thread-parts";
import { TraceHeader, type TraceView } from "./trace-panel";
import { AnswerActions, cardKind, Related } from "./turn-view";

type ThreadTab = "answer" | "sources" | "steps";

/**
 * Citations in a thread read as small numbered chips (the colour stays the citation's own: ink, or amber when the
 * source is unavailable). Clicking one opens its source, as everywhere else.
 */
const CITE_CHIPS =
  "[&_.cite]:mx-0.5 [&_.cite]:inline-grid [&_.cite]:h-[18px] [&_.cite]:min-w-[18px] [&_.cite]:place-items-center [&_.cite]:rounded-full [&_.cite]:bg-secondary [&_.cite]:px-1 [&_.cite]:align-[2px] [&_.cite]:leading-none [&_.cite]:no-underline [&_.cite:hover]:bg-border";

export type ThreadTurnProps = {
  turn: Turn;
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
  /** When each saved message was first written (ISO), by message id: when the question was asked. */
  times?: Record<string, string>;
  /** The chat's team, for "Open in Risk" on a team-scope lookup that left the team to default. */
  teamSlug: string | null;
  onFlag?: () => void;
  /** Suggested next questions, under the last answer. */
  related?: string[];
  onAsk?: (question: string) => void;
  /** What the run is doing when this is the last turn and Hoot hasn't started the answer (reading, catching up, failed). */
  status?: ReactNode;
};

/**
 * One question and its answer in a thread, drawn like Perplexity: the question as a large heading, then three tabs.
 * Answer: "Hoot answered at 1:14 PM" with his face, the answer in his serif with numbered citation chips, live tables,
 * any change he proposed, and (under the last answer) Related questions. Sources: every source the answer read, numbered
 * the way it cites them. Steps: what Hoot did, lookup by lookup (with the live trace in transparency mode).
 */
export function ThreadTurn(props: ThreadTurnProps) {
  const { turn, chatId, allSources, sources, live, catchingUp, trace = null, now, teamSlug, onFlag, related, onAsk, status } = props;
  const [tab, setTab] = useState<ThreadTab>("answer");
  // A question asked on this page has no saved time yet: it was asked about when its turn first appeared.
  const [seenAt] = useState(() => new Date().toISOString());
  const numbers = useMemo(() => new Map(sources.map((r) => [r.source.id, r.n])), [sources]);
  const proposals = useMemo(() => proposalsOf((turn.assistant?.parts ?? []) as Part[]), [turn.assistant]);
  const summary = summarizeActivity(turn.activity);
  // The saved time is the whole run on the server; this page's own clock only stands in until the answer is saved.
  const elapsed = savedTurnMs(turn) ?? props.elapsedMs ?? null;
  const idBase = `turn-${turn.id}`;
  const meta = (turn.assistant?.metadata ?? {}) as { uncited?: number; stopped?: boolean };
  const pages = live ? [] : turnPageLinks(turn.activity, teamSlug);
  // Catching up on a run this page isn't attached to: the status row under the tabs says so instead.
  const answered = live || (!!turn.assistant && (!!turn.answerText || !catchingUp));

  return (
    <ResearchSources sources={allSources} numbers={numbers} chatId={chatId}>
      <section aria-labelledby={`${idBase}-q`} className="flex flex-col">
        <h2 id={`${idBase}-q`} className={cn("text-display font-medium tracking-[-0.015em] whitespace-pre-wrap", turn.label && "text-ink-2")}>
          {/* A job's label ("Call brief · RSG") reads without the dot. */}
          {turn.label ? turn.label.split(" · ").join(", ") : turn.question}
        </h2>
        {turn.page && turn.page.kind !== "page" && (
          <Link href={turn.page.path} className="mt-1.5 inline-flex items-center gap-1 self-start text-caption text-muted-foreground hover:text-foreground">
            <Eye className="size-3" aria-hidden /> Asked from {pageContextLabel(turn.page)}
          </Link>
        )}
        <Tabs
          label="This answer"
          idBase={idBase}
          onSelect={(k) => setTab(k as ThreadTab)}
          className="mt-[18px]"
          items={[
            { key: "answer", label: "Answer", active: tab === "answer" },
            { key: "sources", label: "Sources", count: sources.length || undefined, active: tab === "sources" },
            { key: "steps", label: "Steps", count: summary.lookups || undefined, active: tab === "steps" },
          ]}
        />
        <div {...tabPanelProps(idBase, tab)} className="pt-[26px]">
          {tab === "answer" && (
            <>
              {answered && <AnsweredLine live={live} label={live ? capitalize(activityLabel(turn.activity, true, trace, elapsed)) : null} at={answeredAt(turn, props.times, seenAt, elapsed)} />}
              {status && <div className={cn("flex flex-col gap-3", answered && "mt-3")}>{status}</div>}
              {turn.answerText ? (
                <>
                  <ResearchAnswer text={turn.answerText} className={cn("mt-2.5 leading-7 [&_p+p]:mt-3.5", CITE_CHIPS)} />
                  {meta.stopped && <p className="mt-2 text-caption text-muted-foreground">You stopped Hoot here, so this answer may be incomplete.</p>}
                </>
              ) : turn.assistant && !live && !catchingUp ? (
                <div className="mt-2.5 text-body font-medium text-caution-foreground">
                  {meta.stopped ? "You stopped Hoot before he wrote an answer." : "Hoot stopped before writing an answer. Ask again to get a written answer."}
                </div>
              ) : null}
              {proposals.map((p) => (
                <ProposalCard key={p.toolCallId} chatId={chatId} toolCallId={p.toolCallId} proposal={p.proposal} outcome={p.outcome} />
              ))}
              {turn.answerText && !live && pages.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {pages.map((p) => (
                    <Link key={p.href} href={p.href} className="text-caption font-semibold text-foreground underline-offset-2 hover:underline">
                      Open in {p.label}
                    </Link>
                  ))}
                </div>
              )}
              {turn.answerText && !live && <AnswerActions variant="thread" text={answerForCopy(turn.answerText, numbers)} unsourced={meta.uncited ?? 0} onFlag={onFlag} />}
              {!live && related && related.length > 0 && onAsk && <Related variant="thread" questions={related} onAsk={onAsk} />}
            </>
          )}
          {tab === "sources" && <SourceRows rows={sources} live={live} />}
          {tab === "steps" && <Steps parts={turn.activity} live={live} trace={trace} now={now} elapsedMs={elapsed} />}
        </div>
      </section>
    </ResearchSources>
  );
}

/** When Hoot answered: the question's time plus how long he took, else when the answer was saved. */
function answeredAt(turn: Turn, times: Record<string, string> | undefined, seenAt: string, elapsedMs: number | null): string | null {
  const asked = times?.[turn.id] ?? seenAt;
  if (elapsedMs !== null) return new Date(Date.parse(asked) + elapsedMs).toISOString();
  return (turn.assistant && times?.[turn.assistant.id]) || null;
}

/** "Hoot answered at 1:14 PM ET" (or on another day's date) with his 22px face; while he works, what he's doing. */
function AnsweredLine({ live, label, at }: { live: boolean; label: string | null; at: string | null }) {
  const now = new Date();
  const when = at ? (fmtDay(at, now) === fmtDay(now, now) ? `at ${fmtTime(at)}` : `on ${fmtDateTime(at, now)}`) : null;
  return (
    <div className="flex items-center gap-2 text-body text-muted-foreground">
      <HootFace className={cn("size-[22px]", live && "motion-safe:animate-pulse")} />
      <span suppressHydrationWarning className="min-w-0 truncate">
        {live ? label : when ? `Hoot answered ${when}` : "Hoot answered"}
      </span>
    </div>
  );
}

/** The Sources tab: every source the answer read, numbered as it cites them. A web page opens in a new tab, a document in the viewer. */
function SourceRows({ rows, live }: { rows: TurnSource[]; live: boolean }) {
  const view = useSourceViewer();
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">{live ? "Sources Hoot reads appear here as he finds them." : "Hoot didn't read any sources for this answer."}</p>;
  }
  return (
    <ol aria-label="Sources" className="flex flex-col border-t">
      {rows.map(({ source: s, n }) => {
        const target = resolveSource(s);
        const unavailable = target.kind === "unavailable";
        const title = unavailable && !s.title?.trim() ? "Source unavailable" : readableTitle(s.title?.trim() || "Untitled source");
        const meta = [unavailable ? null : cardKind(s), s.publisher || "Publisher unavailable", shortDate(s.publishedAt)].filter(Boolean).join(", ");
        const body = (
          <>
            <span className={cn("grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-secondary px-1 text-caption leading-none font-semibold", unavailable ? "text-caution-foreground" : "text-foreground")}>{n}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body font-medium">{title}</span>
              <span className="text-caption text-muted-foreground">
                {meta}
                {unavailable && <span className="font-semibold text-caution-foreground">. Unavailable</span>}
              </span>
              {s.excerpt?.trim() && <span className="line-clamp-2 text-caption text-ink-2">{s.excerpt.trim()}</span>}
            </span>
          </>
        );
        const cls = "flex w-full items-start gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
        return (
          <li key={s.id} className="border-b border-row">
            {target.kind === "external" ? (
              <a href={target.href} target="_blank" rel="noopener noreferrer" aria-label={`[${n}] ${title} (opens in a new tab)`} className={cn(cls, "hover:bg-band")}>
                {body}
              </a>
            ) : target.kind === "document" ? (
              <button type="button" onClick={() => view(s)} aria-label={`[${n}] ${title}`} className={cn(cls, "hover:bg-band")}>
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The Steps tab: what Hoot did in a line ("Worked for 12s, read 4 sources"), the live trace for execs, then each lookup. */
function Steps({ parts, live, trace, now, elapsedMs }: { parts: Part[]; live: boolean; trace: TraceView | null; now: number; elapsedMs: number | null }) {
  const rows = activityRows(parts, trace);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-ink-2">{capitalize(live ? activityLabel(parts, true, trace, elapsedMs) : workedLine(summarizeActivity(parts), elapsedMs))}</p>
      {trace && <TraceHeader view={trace} now={now} />}
      <div className="border-y py-1.5 text-body">{rows.length > 0 ? rows : <p className="py-1 text-muted-foreground">No lookups{live ? " yet" : ""}.</p>}</div>
    </div>
  );
}
