"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtBp, fmtChangePct, fmtDate, fmtDateTime, fmtDayMonth, fmtMoney, fmtPct, ppToBp } from "@/lib/format";
import type { RunStatus } from "@/lib/chats";
import type { Source } from "@/lib/providers/types";
import { collectSources } from "@/lib/agent/citations";
import { chatWhen, marketFigure, pairTurns, stepLabel, turnSources, type Turn, type TurnSource } from "@/lib/agent/board";
import { resolveSource } from "@/lib/agent/source-resolution";
import { clearHootQuestion, peekHootQuestion } from "@/components/app/hoot/handoff";
import { createHoldingChat, deleteChat } from "@/lib/actions/chats";
import { boardHref, holdingHref, movementHref } from "@/lib/scope";
import type { CitationLinks } from "@/components/app/chat/research-answer";
import { SourceViewer } from "@/components/app/chat/source-viewer";
import { FLAG_PROMPT } from "@/components/app/chat/conversation";
import { Composer, SideHeading, shortDate, SourceNumber, ThinkingRow, ThreadNote } from "@/components/app/chat/thread-parts";
import { cardKind, TurnView } from "@/components/app/chat/turn-view";
import { TraceToggle } from "@/components/app/chat/trace-toggle";
import { useResearchChat } from "@/components/app/chat/use-research-chat";
import { PageHead } from "@/components/app/page-head";
import { Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import type { MemoryEntry } from "@/lib/agent/memory/prompt";
import { ResearchMemory, suggestionsFor } from "@/components/app/agent/research-log-card";

export type BoardChat = { id: string; title: string; authorName: string | null; questions: number; updatedAt: string; canDelete: boolean; running?: boolean };
export type BoardMarket = { price?: number; changePct?: number; relativePp?: number; asOf?: string };
/** The open movement write-up on this holding: what the move was, and when the team's update is due. */
export type BoardMovement = { id: string; dueAt: string | null; overdue: boolean; sessionDate: string; returnPct: number | null; relativePp: number | null };
export type BoardEarnings = { reportDate: string; dateStatus: string; fiscalPeriod: string | null };

type Props = {
  team: { id: string; slug: string; name: string };
  /** The scope the board was opened in (the fund, or the holding's team); its URLs stay there. */
  scopeSlug: string;
  holding: { id: string; ticker: string; name: string };
  market: Promise<BoardMarket>;
  /** An open movement: the team owes an update (`overdue` once the due time has passed). */
  movement: BoardMovement | null;
  chats: BoardChat[];
  initialChatId: string | null;
  initialMessages: UIMessage[];
  initialRunStatus: RunStatus;
  configured: boolean;
  transparency: boolean;
  /** Exec/admin: show the Trace (transparency) toggle. */
  canTrace: boolean;
  userName: string;
  /** The agent's research log for this holding (newest first). */
  memories: MemoryEntry[];
  /** Whether this user may remove research-log entries. */
  canManage: boolean;
  /** The next report on the calendar, for "Earnings prep". */
  earnings: BoardEarnings | null;
  /** The pre-earnings evidence pack card for the next report, when one has been built. */
  prepCard?: ReactNode;
};

const SUGGESTIONS = (t: string) => [
  `What moved ${t} today versus the S&P 500, and what filings or news are in the window?`,
  `Summarize the most recent filing for ${t} and what changed.`,
  `What does the team already have on file about ${t}?`,
];

type ChatState = { messages: UIMessage[]; runStatus: RunStatus };

/**
 * One holding's research, in Research: this holding's chats on the left (they switch on the client; the URL's `chat`
 * param follows the selection), the conversation in the middle with its box pinned at the bottom, and on the right the
 * sources behind the selected answer, what Hoot remembers about the holding, and its earnings prep. An open movement
 * write-up shows as a banner over all three.
 */
export function HoldingBoard(props: Props) {
  const { team, holding, configured, transparency, canTrace, userName, memories, canManage } = props;
  const suggestions = useMemo(() => suggestionsFor(holding.ticker, memories, SUGGESTIONS), [holding.ticker, memories]);
  const [chats, setChats] = useState(props.chats);
  const [chatId, setChatId] = useState(props.initialChatId);
  const [cache, setCache] = useState<Record<string, ChatState>>(() => (props.initialChatId ? { [props.initialChatId]: { messages: props.initialMessages, runStatus: props.initialRunStatus } } : {}));
  const [loading, setLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The first question of a chat created from the empty state; sent as soon as the thread mounts.
  const [autoSend, setAutoSend] = useState<{ chatId: string; text: string } | null>(null);
  const [starting, setStarting] = useState(false);

  const chat = chats.find((c) => c.id === chatId) ?? null;
  const boardPath = boardHref(props.scopeSlug, team.slug, holding.ticker);
  const syncUrl = (id: string | null, push: boolean) => {
    const url = id ? `${boardPath}?chat=${id}` : boardPath;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };

  const selectChat = useCallback(
    async (id: string) => {
      setLoadError(null);
      if (id === chatId) return;
      if (!cache[id]) {
        setLoading(id);
        try {
          const res = await fetch(`/api/chat/${id}`, { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as ChatState;
          setCache((c) => ({ ...c, [id]: data }));
        } catch (e) {
          setLoadError(e instanceof Error ? e.message : "Could not load that chat.");
          setLoading(null);
          return;
        }
        setLoading(null);
      }
      setChatId(id);
      syncUrl(id, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, cache],
  );

  const newChat = () => {
    setChatId(null);
    syncUrl(null, true);
  };

  /** From the empty state: create the chat row, then let the mounted thread send the question. */
  const start = async (text: string) => {
    const t = text.trim();
    if (!t || starting) return;
    setStarting(true);
    try {
      const { id } = await createHoldingChat({ teamId: team.id, holdingId: holding.id });
      const now = new Date().toISOString();
      setChats((cs) => [{ id, title: "New chat", authorName: userName, questions: 0, updatedAt: now, canDelete: true }, ...cs]);
      setCache((c) => ({ ...c, [id]: { messages: [], runStatus: "idle" } }));
      setAutoSend({ chatId: id, text: t });
      setChatId(id);
      syncUrl(id, true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not start a chat.");
    } finally {
      setStarting(false);
    }
  };

  /** Mirror the server's titling and counts so the list reads right before the next full load. */
  const onSent = (id: string, text: string) => {
    const now = new Date().toISOString();
    setChats((cs) =>
      cs.map((c) => (c.id === id ? { ...c, title: c.questions === 0 && c.title === "New chat" ? text.replace(/\s+/g, " ").trim().slice(0, 80) : c.title, questions: c.questions + 1, updatedAt: now } : c)),
    );
  };

  const holdingPath = holdingHref(props.scopeSlug, team.slug, holding.ticker);
  const head = (
    <PageHead
      crumbs={[{ label: "Research", href: `/t/${props.scopeSlug}/agent` }, { label: `${holding.ticker} · ${holding.name}` }]}
      tabs={false}
      asof={
        <Suspense fallback={null}>
          <BoardQuote market={props.market} />
        </Suspense>
      }
      actions={
        <>
          {canTrace && <TraceToggle on={transparency} />}
          {chat && chat.canDelete && (
            <form
              action={deleteChat}
              className="flex"
              onSubmit={(e) => {
                if (!confirm("Clear this chat? Its questions, answers, and sources are removed for the whole team.")) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={chat.id} />
              <Button type="submit" variant="destructive">
                Clear chat
              </Button>
            </form>
          )}
          <Button nativeButton={false} variant="secondary" render={<Link href={holdingPath} />}>
            Open holding
          </Button>
          <Button type="button" onClick={newChat} disabled={!chat && !loading}>
            New chat
          </Button>
        </>
      }
    />
  );

  const state = chatId ? cache[chatId] : undefined;
  const side = { ticker: holding.ticker, memories, canManage, earnings: props.earnings, prepCard: props.prepCard };
  return (
    <div data-full-bleed className="flex h-dvh min-h-0 flex-col">
      {head}
      {props.movement && <MovementBanner movement={props.movement} team={team.name} href={movementHref(props.scopeSlug, team.slug, props.movement.id)} />}
      <div className="flex min-h-0 flex-1">
        <ChatsColumn ticker={holding.ticker} chats={chats} selectedId={chatId} onSelect={(id) => void selectChat(id)} boardPath={boardPath} />
        {chatId && state ? (
          <BoardThread
            key={chatId}
            chatId={chatId}
            loadError={loadError}
            holding={holding}
            initial={state}
            configured={configured}
            transparency={transparency}
            autoSend={autoSend?.chatId === chatId ? autoSend.text : null}
            onSent={(text) => onSent(chatId, text)}
            suggestions={suggestions}
            side={side}
          />
        ) : (
          <EmptyBoard loadError={loadError} holding={holding} configured={configured} busy={starting || loading !== null} hasChats={chats.length > 0} onAsk={start} suggestions={suggestions} side={side} />
        )}
      </div>
    </div>
  );
}

/** "198.60 · (0.54%) today", in the header's grey note. */
function BoardQuote({ market }: { market: Promise<BoardMarket> }) {
  const m = use(market);
  if (m.changePct === undefined) return <>Quote unavailable</>;
  const tone = m.changePct > 0.005 ? "text-up" : m.changePct < -0.005 ? "text-down" : undefined;
  return (
    <span title={m.asOf ? `As of ${fmtDateTime(m.asOf)}${m.relativePp !== undefined ? ` · ${fmtBp(ppToBp(m.relativePp))} vs S&P 500` : ""}` : undefined}>
      {m.price !== undefined && <>{fmtMoney(m.price)} · </>}
      <span className={tone}>{fmtChangePct(m.changePct)}</span> today
    </span>
  );
}

/**
 * The open movement write-up, above the columns: "Movement overdue" (red) or "Movement open" (amber), what the move
 * was, and the way to the write-up. The write-up itself stays the team's; this only points at it.
 */
function MovementBanner({ movement, team, href }: { movement: BoardMovement; team: string; href: string }) {
  const { overdue } = movement;
  const move =
    movement.returnPct !== null
      ? `${movement.returnPct < 0 ? "Fell" : "Rose"} ${fmtPct(movement.returnPct)} on ${fmtDayMonth(movement.sessionDate)}${movement.relativePp !== null ? `, ${fmtBp(ppToBp(movement.relativePp))} against the S&P 500` : ""}`
      : `Moved on ${fmtDayMonth(movement.sessionDate)}`;
  return (
    <div className="flex items-center gap-2.5 border-b px-10 py-3 text-body">
      <Pill tone={overdue ? "hoot" : "caution"}>{overdue ? "Movement overdue" : "Movement open"}</Pill>
      <span className="min-w-0 truncate text-ink-2">
        {move}
        {movement.dueAt && ` · the ${team} write-up ${overdue ? "was" : "is"} due ${fmtDateTime(movement.dueAt)}`}
      </span>
      <span className="flex-1" />
      <Link href={href} className="shrink-0 font-semibold text-foreground hover:underline">
        Open the write-up
      </Link>
    </div>
  );
}

/** Chats on this holding, newest first; the open one is bold. */
function ChatsColumn({ ticker, chats, selectedId, onSelect, boardPath }: { ticker: string; chats: BoardChat[]; selectedId: string | null; onSelect: (id: string) => void; boardPath: string }) {
  return (
    <aside aria-label={`Chats on ${ticker}`} className="w-60 shrink-0 overflow-y-auto border-r pt-[18px] pr-4 pl-10">
      <div className="pb-1 text-caption font-semibold text-muted-foreground">
        Chats on {ticker} · {chats.length}
      </div>
      {chats.length === 0 ? (
        <p className="pt-1 text-caption text-muted-foreground">No chats on {ticker} yet. Ask a question to start one.</p>
      ) : (
        chats.map((c) => {
          const current = c.id === selectedId;
          return (
            <a
              key={c.id}
              href={`${boardPath}?chat=${c.id}`}
              aria-current={current ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onSelect(c.id);
              }}
              className={cn("flex flex-col border-b border-row py-2 text-foreground no-underline hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring", current ? "font-semibold" : "font-normal")}
            >
              <span className="line-clamp-2 text-body">{c.title === "New chat" ? "New conversation" : c.title}</span>
              <span className={cn("text-caption font-normal", c.running ? "text-caution-foreground" : "text-muted-foreground")}>
                {c.running ? "Answering…" : `${c.authorName ?? "Someone"} · ${chatWhen(c.updatedAt)}`}
              </span>
            </a>
          );
        })
      )}
    </aside>
  );
}

type SideProps = { ticker: string; memories: MemoryEntry[]; canManage: boolean; earnings: BoardEarnings | null; prepCard?: ReactNode };

/** The right column: sources behind the answer, what Hoot remembers, earnings prep. */
function SideColumn({ sources, side }: { sources: ReactNode; side: SideProps }) {
  const { earnings, prepCard, ticker } = side;
  return (
    <aside aria-label="Sources, memories and prep" className="flex w-[300px] shrink-0 flex-col gap-[22px] overflow-y-auto border-l pt-[18px] pr-10 pb-8 pl-6">
      <section aria-label="Sources and research log">{sources}</section>
      <ResearchMemory ticker={ticker} entries={side.memories} canManage={side.canManage} />
      <section aria-label="Earnings prep">
        <SideHeading>Earnings prep</SideHeading>
        {prepCard ? (
          <div className="mt-1">{prepCard}</div>
        ) : earnings ? (
          <p className="mt-1 text-caption text-ink-2">
            {earnings.fiscalPeriod ? `${earnings.fiscalPeriod} report` : "Next report"} {fmtDate(earnings.reportDate)}
            {earnings.dateStatus === "estimated" ? " (est.)" : ""}. The prep pack builds two weeks before.
          </p>
        ) : (
          <p className="mt-1 text-caption text-ink-2">No report is on the calendar yet. The prep pack builds two weeks before one.</p>
        )}
      </section>
    </aside>
  );
}

function EmptySources() {
  return <p className="mt-1 text-caption text-muted-foreground">Sources appear here as Hoot reads them, numbered the way the answer cites them. Click a number in the answer to read the cited passage.</p>;
}

function BoardIntro({ ticker, again, suggestions, disabled, onPick }: { ticker: string; again: boolean; suggestions: string[]; disabled: boolean; onPick: (s: string) => void }) {
  return (
    <div className="flex max-w-[620px] flex-col gap-3 pt-2">
      <h2 className="font-serif text-display font-normal tracking-[-0.02em]">{again ? `New chat about ${ticker}` : `Start a chat about ${ticker}`}</h2>
      <p className="text-body text-ink-2">Ask anything about this holding. The sources for each answer appear on the right; the answer cites them by number.</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-md bg-secondary px-3 py-1.5 text-left text-body text-ink-3 transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type PaneProps = {
  loadError: string | null;
  holding: Props["holding"];
  configured: boolean;
  suggestions: string[];
  side: SideProps;
};

/** The centre column's frame: the thread scrolls, the question box is pinned over the bottom. */
function Centre({ scroller, composer, children }: { scroller?: React.Ref<HTMLDivElement>; composer: ReactNode; children: ReactNode }) {
  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-8 pt-[22px] pb-28">
        <div className="flex max-w-[720px] flex-col gap-8">{children}</div>
      </div>
      <div className="absolute inset-x-8 bottom-5">{composer}</div>
    </section>
  );
}

function EmptyBoard({ loadError, holding, configured, busy, hasChats, onAsk, suggestions, side }: PaneProps & { busy: boolean; hasChats: boolean; onAsk: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <>
      <Centre
        composer={
          <Composer
            variant="compact"
            value={draft}
            onChange={setDraft}
            onSend={() => {
              if (draft.trim()) onAsk(draft);
            }}
            disabled={busy || !configured}
            placeholder={configured ? "Ask about a holding, a filing, a move…" : "Hoot isn't set up yet: an admin needs to turn it on"}
            sees={`${holding.ticker} research`}
            label={`Ask about ${holding.ticker}`}
          />
        }
      >
        {loadError && <ThreadNote tone="error">{loadError}</ThreadNote>}
        <BoardIntro ticker={holding.ticker} again={hasChats} suggestions={suggestions} disabled={busy || !configured} onPick={onAsk} />
        {busy && (
          <ThreadNote tone="muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Opening a chat…
          </ThreadNote>
        )}
      </Centre>
      <SideColumn sources={<><SideHeading count={0}>Sources and research log</SideHeading><EmptySources /></>} side={side} />
    </>
  );
}

function BoardThread({
  chatId,
  loadError,
  holding,
  initial,
  configured,
  transparency,
  autoSend,
  onSent,
  suggestions,
  side,
}: PaneProps & {
  chatId: string;
  initial: ChatState;
  transparency: boolean;
  autoSend: string | null;
  onSent: (text: string) => void;
}) {
  const { messages, status, streaming, busy, catchingUp, runError, requestError, traceView, now, durations, send, stopWatching } = useResearchChat({
    chatId,
    initialMessages: initial.messages,
    initialRunStatus: initial.runStatus,
    transparency,
  });
  const [draft, setDraft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Source | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Deferred a tick: the SDK's sendMessage awaits before it queues the message, and a stop() in that window
  // (React's development double-invoke of effects calls the hook's cleanup) makes it return silently.
  // A question asked through Hoot arrives the same way, handed over in sessionStorage with the chat preselected.
  useEffect(() => {
    const asked = autoSend ? { text: autoSend, page: null } : peekHootQuestion(chatId);
    if (!asked) return;
    const { text } = asked;
    const t = setTimeout(() => {
      if (send(text, asked.page)) {
        clearHootQuestion(chatId);
        onSent(text);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, chatId]);

  const turns = useMemo(() => pairTurns(messages), [messages]);
  const allSources = useMemo(() => collectSources(messages), [messages]);
  const last = turns[turns.length - 1];
  const active = (activeId && turns.find((t) => t.id === activeId)) || last || null;
  const live = streaming && active === last;
  const perTurn = useMemo(() => new Map(turns.map((t) => [t.id, turnSources(t, allSources)])), [turns, allSources]);
  const sources = active ? (perTurn.get(active.id) ?? []) : [];

  // Follow the answer as it streams in.
  useEffect(() => {
    const el = threadRef.current;
    if (el && (streaming || catchingUp)) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, catchingUp]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** A citation click opens its row and brings it into view; a long answer can have rows below the fold. */
  const reveal = (id: string) => {
    requestAnimationFrame(() => document.getElementById(`board-src-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const activate = (t: Turn) => {
    if (t.id === active?.id) return;
    setActiveId(t.id);
    setOpen(new Set());
    setHover(null);
  };
  const submit = () => {
    const text = draft.trim();
    if (send(text)) {
      setDraft("");
      setActiveId(null);
      setOpen(new Set());
      onSent(text);
    }
  };
  const copyCitation = async (s: Source) => {
    const date = s.publishedAt ? fmtDate(s.publishedAt) : null;
    const text = [s.title, [s.publisher, date].filter(Boolean).join(", "), s.url].filter(Boolean).join(" — ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(s.id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard unavailable; nothing to undo */
    }
  };

  const sub = !active ? "Empty until you ask" : live && !active.answerText ? `${sources.length} so far · gathering` : `For ${turns.length > 1 ? (active === last ? "the latest answer" : "the selected answer") : "this answer"}`;

  return (
    <>
      <Centre
        scroller={threadRef}
        composer={
          <Composer
            variant="compact"
            inputRef={composerRef}
            value={draft}
            onChange={setDraft}
            onSend={submit}
            onStop={stopWatching}
            streaming={streaming}
            disabled={!configured || catchingUp}
            placeholder={!configured ? "Hoot isn't set up yet: an admin needs to turn it on" : catchingUp ? "Waiting for the current answer…" : "Ask about a holding, a filing, a move…"}
            sees={`${holding.ticker} research`}
            label={`Ask about ${holding.ticker}`}
          />
        }
      >
        {loadError && <ThreadNote tone="error">{loadError}</ThreadNote>}
        {turns.length === 0 && (
          <BoardIntro
            ticker={holding.ticker}
            again
            suggestions={suggestions}
            disabled={busy || !configured}
            onPick={(s) => {
              if (send(s)) onSent(s);
            }}
          />
        )}
        {turns.map((t) => {
          const isActive = t === active;
          const rows = perTurn.get(t.id) ?? [];
          const links: CitationLinks = isActive
            ? {
                onCite: (id) => {
                  if (!open.has(id)) reveal(id);
                  toggle(id);
                },
                onHover: setHover,
                openIds: open,
                highlight: hover,
              }
            : {
                onCite: (id) => {
                  setActiveId(t.id);
                  setOpen(new Set([id]));
                  setHover(null);
                  reveal(id);
                },
                dim: true,
              };
          const turnLive = streaming && t === last;
          return (
            <div key={t.id} onClick={() => activate(t)} className={cn(!isActive && turns.length > 1 && "cursor-pointer")} aria-current={isActive && turns.length > 1 ? "true" : undefined}>
              <TurnView
                turn={t}
                variant="board"
                chatId={chatId}
                allSources={allSources}
                sources={rows}
                live={turnLive}
                catchingUp={catchingUp}
                trace={t === last ? traceView : null}
                now={now}
                elapsedMs={durations[t.id] ?? null}
                teamSlug={null}
                links={links}
                onFlag={() => {
                  setDraft((v) => v || FLAG_PROMPT);
                  composerRef.current?.focus();
                }}
              />
            </div>
          );
        })}
        {status === "submitted" && !last?.assistant && <ThinkingRow>Reading the question…</ThinkingRow>}
        {catchingUp && <ThinkingRow>Still working on the last question. The answer appears here when it is ready; you can leave and come back.</ThinkingRow>}
        {runError && <ThreadNote tone="caution">{runError}</ThreadNote>}
        {requestError && <ThreadNote tone="error">{requestError}</ThreadNote>}
      </Centre>
      <SideColumn
        side={side}
        sources={
          <>
            <SideHeading count={active ? sources.length : undefined}>Sources and research log</SideHeading>
            <div className="mt-0.5 text-caption text-muted-foreground">{sub}</div>
            {!active || (sources.length === 0 && !live) ? (
              <EmptySources />
            ) : (
              <div className="mt-1">
                {sources.map((row) => (
                  <BoardSourceRow
                    key={row.source.id}
                    row={row}
                    isOpen={open.has(row.source.id)}
                    hot={hover === row.source.id}
                    copied={copied === row.source.id}
                    onToggle={() => toggle(row.source.id)}
                    onHover={setHover}
                    onCopy={() => void copyCitation(row.source)}
                    onView={() => setViewer(row.source)}
                  />
                ))}
                {live && (
                  <div className="flex items-center gap-2 border-b border-row py-[7px] text-caption text-muted-foreground">
                    <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
                    {active ? stepLabel(active) : "Working…"}
                  </div>
                )}
              </div>
            )}
            <SourceViewer source={viewer} chatId={chatId} onClose={() => setViewer(null)} />
          </>
        }
      />
    </>
  );
}

/**
 * One source behind the selected answer, on a hairline row: its number, its title (or the figure, for a quote or a
 * relative move) and its kind. Click to read the cited passage, open the document, or copy the citation.
 */
function BoardSourceRow({
  row,
  isOpen,
  hot,
  copied,
  onToggle,
  onHover,
  onCopy,
  onView,
}: {
  row: TurnSource;
  isOpen: boolean;
  hot: boolean;
  copied: boolean;
  onToggle: () => void;
  onHover: (id: string | null) => void;
  onCopy: () => void;
  onView: () => void;
}) {
  const s = row.source;
  const figure = marketFigure(row);
  const target = resolveSource(s);
  const unavailable = target.kind === "unavailable";
  const snippet = s.excerpt?.trim();
  const toneClass = figure?.tone === "up" ? "text-up" : figure?.tone === "down" ? "text-down" : "text-foreground";
  const kind = unavailable ? "unavailable" : figure ? "market data" : cardKind(s).toLowerCase();
  const meta = [s.publisher || "Publisher unavailable", shortDate(s.publishedAt)].filter(Boolean).join(" · ");
  return (
    <div
      id={`board-src-${s.id}`}
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      onMouseEnter={() => onHover(s.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "grid cursor-pointer grid-cols-[16px_minmax(0,1fr)] gap-1.5 border-b border-row py-[7px] text-caption transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        (isOpen || hot) && "bg-band",
      )}
    >
      <SourceNumber n={row.n} className={unavailable ? "text-caution-foreground" : undefined} />
      <div className="min-w-0">
        {figure ? (
          <span>
            <span className={cn("font-semibold", toneClass)}>{figure.big}</span> <span className="text-muted-foreground">{figure.sub}</span>
          </span>
        ) : (
          <span>{s.title?.trim() || "Untitled source"}</span>
        )}
        <span className={cn(unavailable ? "text-caution-foreground" : "text-muted-foreground")}> · {kind}</span>
        {isOpen && (
          <div onClick={(e) => e.stopPropagation()} className="cursor-auto">
            <div className="mt-1 text-muted-foreground">
              {meta} · {row.cited ? `cited ${row.cited}×` : "not cited"}
            </div>
            <div className="mt-1.5 border-l border-border-strong pl-2 text-ink-3">
              {snippet ? <mark className="bg-caution px-0.5 text-foreground">{snippet}</mark> : <span className="text-muted-foreground">No supporting passage was saved for this source. Open it to review the document.</span>}
              {(s.location?.section || s.location?.page) && <div className="mt-1 text-muted-foreground">{[s.location.section, s.location.page ? `Page ${s.location.page}` : null].filter(Boolean).join(" · ")}</div>}
            </div>
            <div className="mt-1.5 flex gap-3.5">
              {target.kind === "external" ? (
                <a href={target.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:underline">
                  Open source
                </a>
              ) : target.kind === "document" ? (
                <button type="button" onClick={onView} className="font-semibold text-foreground hover:underline">
                  Open document
                </button>
              ) : (
                <span className="font-semibold text-caution-foreground">Source unavailable</span>
              )}
              <button type="button" onClick={onCopy} className="text-ink-2 hover:text-foreground">
                {copied ? "Copied" : "Copy citation"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
