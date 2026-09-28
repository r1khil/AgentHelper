"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fixed, fmtDateTime, fmtMoney } from "@/lib/format";
import type { RunStatus } from "@/lib/chats";
import type { Source } from "@/lib/providers/types";
import { collectSources } from "@/lib/agent/citations";
import { marketFigure, pairTurns, stepLabel, turnSources, type Turn, type TurnSource } from "@/lib/agent/board";
import { resolveSource, sourceType } from "@/lib/agent/source-resolution";
import { clearHootQuestion, peekHootQuestion } from "@/components/app/hoot/handoff";
import { createHoldingChat, deleteChat } from "@/lib/actions/chats";
import { ResearchAnswer, ResearchSources, type CitationLinks } from "@/components/app/chat/research-answer";
import { SourceViewer } from "@/components/app/chat/source-viewer";
import { ActivityRow, Composer, shortDate, SourceNumber, ThinkingRow, ThreadHeader, ThreadNote, UserBubble } from "@/components/app/chat/thread-parts";
import { TraceToggle } from "@/components/app/chat/trace-toggle";
import { headerAction } from "@/components/app/chat/styles";
import { useResearchChat } from "@/components/app/chat/use-research-chat";
import { Pill } from "@/components/app/panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemoryEntry } from "@/lib/agent/memory/prompt";
import { ResearchLogCard, suggestionsFor } from "@/components/app/agent/research-log-card";
import { ConversationSidebar, type ResearchSidebarData, type SidebarChat } from "@/components/app/agent/conversation-list";
import { CenterColumn, ListColumn, ResearchGrid, SideColumn } from "@/components/app/agent/research-columns";

export type BoardChat = { id: string; title: string; authorName: string | null; questions: number; updatedAt: string; canDelete: boolean };
export type BoardMarket = { price?: number; changePct?: number; relativePp?: number; asOf?: string };

type Props = {
  team: { id: string; slug: string; name: string };
  holding: { id: string; ticker: string; name: string };
  market: Promise<BoardMarket>;
  /** An open movement: the analyst owes an update (`overdue` once the due time has passed). */
  movement: { id: string; dueAt: string | null; overdue?: boolean } | null;
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
  /** The pre-earnings evidence pack card for the next report, when one has been built. */
  prepCard?: ReactNode;
  /** The Research list: other boards' chats and general conversations. */
  sidebar: ResearchSidebarData;
  /** Where the list's New files a general chat. */
  newTeamSlug: string | null;
};

const SUGGESTIONS = (t: string) => [
  `What moved ${t} today versus the S&P 500, and what filings or news are in the window?`,
  `Summarize the most recent filing for ${t} and what changed.`,
  `What does the team already have on file about ${t}?`,
];

type ChatState = { messages: UIMessage[]; runStatus: RunStatus };
type SideTab = "sources" | "board";

/**
 * The research board for one holding, in Research › Conversations: the list on the left (this board's chats switch
 * on the client; the URL's `chat` param follows the selection), the thread in the middle, and on the right the sources
 * behind the selected answer, with the board's research log and prep pack a tab away.
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
  const [tab, setTab] = useState<SideTab>(props.initialChatId ? "sources" : "board");

  const chat = chats.find((c) => c.id === chatId) ?? null;
  const boardPath = `/t/${team.slug}/agent/h/${holding.ticker}`;
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
      setTab("sources");
      syncUrl(id, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, cache],
  );

  const newChat = () => {
    setChatId(null);
    setTab("board");
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
      setTab("sources");
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

  // The list shows every chat on this board (as the board knows them, including ones just started) beside the
  // other boards' recent chats.
  const sidebar = useMemo<ResearchSidebarData>(() => {
    const running = new Map(props.sidebar.boards.map((c) => [c.id, c.running]));
    const mine: SidebarChat[] = chats.map((c) => ({
      id: c.id,
      href: `${boardPath}?chat=${c.id}`,
      title: c.title,
      authorName: c.authorName,
      questions: c.questions,
      updatedAt: c.updatedAt,
      running: running.get(c.id) ?? false,
      ticker: holding.ticker,
      holdingId: holding.id,
    }));
    const others = props.sidebar.boards.filter((c) => c.holdingId !== holding.id);
    return { boards: [...mine, ...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), general: props.sidebar.general };
  }, [chats, props.sidebar, boardPath, holding.ticker, holding.id]);

  const overdue = props.movement?.overdue ?? false;
  const header = (
    <ThreadHeader
      ticker={holding.ticker}
      title={loading ? "Loading…" : chat ? chat.title : "New chat"}
      meta={chat ? [team.name, chat.authorName, `${chat.questions} question${chat.questions === 1 ? "" : "s"}`].filter(Boolean).join(" · ") : `${holding.name} · ${team.name}`}
    >
      {props.movement && (
        <Pill tone={overdue ? "hoot" : "caution"} title={props.movement.dueAt ? `Update ${overdue ? "was " : ""}due ${fmtDateTime(props.movement.dueAt)}` : undefined}>
          {overdue ? "Movement overdue" : "Movement open"}
        </Pill>
      )}
      {canTrace && <TraceToggle on={transparency} />}
      {(chat || loading) && (
        <button type="button" onClick={newChat} className={headerAction}>
          <Plus />
          New chat
        </button>
      )}
      {chat && chat.canDelete && (
        <form
          action={deleteChat}
          className="flex"
          onSubmit={(e) => {
            if (!confirm("Clear this chat? Its questions, answers, and sources are removed for the whole team.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={chat.id} />
          <button type="submit" className={cn(headerAction, "hover:text-destructive")}>
            <Trash2 />
            Clear chat
          </button>
        </form>
      )}
    </ThreadHeader>
  );

  const boardTab = (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] bg-card px-3 py-2.5 shadow-[0_0_0_1px_var(--border)]">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[13.5px] font-semibold">{holding.ticker}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{holding.name}</span>
        </div>
        <Suspense fallback={<Skeleton className="mt-1.5 h-4 w-32" />}>
          <BoardQuote market={props.market} />
        </Suspense>
        {props.movement && (
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-down">
            <span className="size-1.5 shrink-0 rounded-full bg-down" />
            Movement open{props.movement.dueAt ? ` · update due ${fmtDateTime(props.movement.dueAt)}` : ""}
          </div>
        )}
      </div>
      {props.prepCard}
      <ResearchLogCard entries={memories} canManage={canManage} defaultOpen />
      {!props.prepCard && memories.length === 0 && (
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">No research log yet. After each answer, Hoot notes what it learned about {holding.ticker} here, and builds an evidence pack before the next report.</p>
      )}
    </div>
  );
  const boardCount = memories.filter((m) => m.kind === "log").length + (props.prepCard ? 1 : 0);

  const state = chatId ? cache[chatId] : undefined;
  return (
    <ResearchGrid>
      <ListColumn>
        <ConversationSidebar
          data={sidebar}
          selectedId={chatId}
          teamSlug={props.newTeamSlug}
          configured={configured}
          onSelect={(c) => {
            if (c.holdingId !== holding.id) return false;
            void selectChat(c.id);
            return true;
          }}
        />
      </ListColumn>
      {chatId && state ? (
        <BoardThread
          key={chatId}
          chatId={chatId}
          header={header}
          loadError={loadError}
          holding={holding}
          initial={state}
          configured={configured}
          transparency={transparency}
          autoSend={autoSend?.chatId === chatId ? autoSend.text : null}
          onSent={(text) => onSent(chatId, text)}
          suggestions={suggestions}
          tab={tab}
          setTab={setTab}
          boardTab={boardTab}
          boardCount={boardCount}
        />
      ) : (
        <EmptyBoard
          header={header}
          loadError={loadError}
          holding={holding}
          configured={configured}
          busy={starting || loading !== null}
          hasChats={chats.length > 0}
          onAsk={start}
          suggestions={suggestions}
          tab={tab}
          setTab={setTab}
          boardTab={boardTab}
          boardCount={boardCount}
        />
      )}
    </ResearchGrid>
  );
}

function BoardQuote({ market }: { market: Promise<BoardMarket> }) {
  const m = use(market);
  if (m.changePct === undefined) return <div className="mt-1 text-[11.5px] text-muted-foreground">Quote unavailable</div>;
  const tone = (v: number) => (v > 0.005 ? "text-up" : v < -0.005 ? "text-down" : "text-muted-foreground");
  const pct = (v: number) => {
    const s = fixed(Math.abs(v), 2);
    return Number(s) === 0 ? `${s}%` : v < 0 ? `(${s}%)` : `+${s}%`;
  };
  const bps = (pp: number) => {
    const n = Math.round(Math.abs(pp) * 100);
    return n === 0 ? "0 bps" : pp < 0 ? `(${n} bps)` : `+${n} bps`;
  };
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-xs tabular-nums" title={m.asOf ? `As of ${fmtDateTime(m.asOf)}` : undefined}>
      {m.price !== undefined && <span>{fmtMoney(m.price)}</span>}
      <span className={cn("font-medium", tone(m.changePct))}>{pct(m.changePct)}</span>
      {m.relativePp !== undefined && <span className="text-muted-foreground">{bps(m.relativePp)} vs S&amp;P</span>}
    </div>
  );
}

/** The side column: Sources (for the selected answer) and Board (research log, prep pack, the holding at a glance). */
function SideTabs({ tab, setTab, sourceCount, boardCount, sources, board }: { tab: SideTab; setTab: (t: SideTab) => void; sourceCount: number; boardCount: number; sources: ReactNode; board: ReactNode }) {
  const item = (key: SideTab, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={cn("inline-flex items-baseline gap-1.5 text-sm transition-colors", tab === key ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
      <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
    </button>
  );
  return (
    <>
      <div role="tablist" aria-label="Board side panel" className="flex shrink-0 items-baseline gap-4">
        {item("sources", "Sources", sourceCount)}
        {item("board", "Board", boardCount)}
      </div>
      <div role="tabpanel" className="-mx-1 mt-2.5 min-h-0 flex-1 overflow-y-auto px-1 pt-px pb-1">
        {tab === "sources" ? sources : board}
      </div>
    </>
  );
}

function EmptySources() {
  return (
    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
      Sources appear here as Hoot reads them, numbered the way the answer cites them. Click a card, or a number in the answer, to read the cited passage.
    </p>
  );
}

function BoardIntro({ ticker, again, suggestions, disabled, onPick }: { ticker: string; again: boolean; suggestions: string[]; disabled: boolean; onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-3 pt-4">
      <div className="text-[15px] font-semibold">{again ? `New chat about ${ticker}` : `Start a chat about ${ticker}`}</div>
      <div className="text-[13.5px] leading-relaxed text-muted-foreground">Ask anything about this holding. Sources for each answer appear on the right; the answer cites them by number.</div>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-[10px] bg-card px-3.5 py-2.5 text-left text-[13.5px] leading-snug shadow-[0_0_0_1px_var(--border)] transition-colors hover:bg-band disabled:opacity-60"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type PaneProps = {
  header: ReactNode;
  loadError: string | null;
  holding: Props["holding"];
  configured: boolean;
  suggestions: string[];
  tab: SideTab;
  setTab: (t: SideTab) => void;
  boardTab: ReactNode;
  boardCount: number;
};

function EmptyBoard({ header, loadError, holding, configured, busy, hasChats, onAsk, suggestions, tab, setTab, boardTab, boardCount }: PaneProps & { busy: boolean; hasChats: boolean; onAsk: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <>
      <CenterColumn>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 px-6 py-6 xl:px-14">
            {loadError && <ThreadNote tone="error">{loadError}</ThreadNote>}
            <BoardIntro ticker={holding.ticker} again={hasChats} suggestions={suggestions} disabled={busy || !configured} onPick={onAsk} />
            {busy && (
              <ThreadNote tone="muted">
                <Loader2 className="size-3.5 animate-spin" /> Opening a chat…
              </ThreadNote>
            )}
          </div>
        </div>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => {
            if (draft.trim()) onAsk(draft);
          }}
          disabled={busy || !configured}
          placeholder={configured ? "Ask about a holding, a filing, a move…" : "Hoot is not configured: add OPENROUTER_API_KEY"}
          sees={`${holding.ticker} research board`}
        />
      </CenterColumn>
      <SideColumn>
        <SideTabs tab={tab} setTab={setTab} sourceCount={0} boardCount={boardCount} sources={<EmptySources />} board={boardTab} />
      </SideColumn>
    </>
  );
}

function BoardThread({
  chatId,
  header,
  loadError,
  holding,
  initial,
  configured,
  transparency,
  autoSend,
  onSent,
  suggestions,
  tab,
  setTab,
  boardTab,
  boardCount,
}: PaneProps & {
  chatId: string;
  initial: ChatState;
  transparency: boolean;
  autoSend: string | null;
  onSent: (text: string) => void;
}) {
  const { messages, status, streaming, busy, catchingUp, runError, requestError, traceView, now, send, stopWatching } = useResearchChat({
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
  /** A chip click opens its card and brings it into view; a long answer can have cards below the fold. */
  const reveal = (id: string) => {
    setTab("sources");
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
    const date = s.publishedAt?.slice(0, 10);
    const text = [s.title, [s.publisher, date].filter(Boolean).join(", "), s.url].filter(Boolean).join(" — ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(s.id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard unavailable; nothing to undo */
    }
  };

  const sub = !active
    ? "Empty until you ask"
    : live && !active.answerText
      ? `${sources.length} so far · gathering`
      : `For ${turns.length > 1 ? (active === last ? "the latest answer" : "the selected answer") : "this answer"}`;

  return (
    <>
      <CenterColumn>
        {header}
        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 px-6 py-6 xl:px-14">
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
              const numbers = new Map(rows.map((r) => [r.source.id, r.n]));
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
              const trace = t === last ? traceView : null;
              return (
                <div key={t.id} onClick={() => activate(t)} className={cn("flex flex-col gap-3", !isActive && "cursor-pointer")} aria-current={isActive && turns.length > 1 ? "true" : undefined}>
                  <UserBubble>
                    <p>{t.question}</p>
                  </UserBubble>
                  {t.assistant && (t.activity.length > 0 || turnLive || trace) && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <ActivityRow parts={t.activity} live={turnLive && !t.answerText} trace={trace} now={now} thinking />
                    </div>
                  )}
                  {t.answerText ? (
                    <ResearchSources sources={allSources} numbers={numbers} links={links} chatId={chatId}>
                      <ResearchAnswer text={t.answerText} className="max-w-[700px] text-[15px] leading-[1.65] [&_p]:my-2.5 [&_p:first-child]:mt-0" />
                    </ResearchSources>
                  ) : t.assistant && !turnLive && !catchingUp ? (
                    <div className="text-[12.5px] text-caution-foreground">Hoot stopped before writing an answer. Its lookups are on the right; ask again to get a written answer.</div>
                  ) : null}
                </div>
              );
            })}
            {status === "submitted" && !last?.assistant && <ThinkingRow>Reading the question…</ThinkingRow>}
            {catchingUp && <ThinkingRow>Still working on the last question. The answer appears here when it is ready; you can leave and come back.</ThinkingRow>}
            {runError && <ThreadNote tone="caution">{runError}</ThreadNote>}
            {requestError && <ThreadNote tone="error">{requestError}</ThreadNote>}
          </div>
        </div>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={submit}
          onStop={stopWatching}
          streaming={streaming}
          disabled={!configured || catchingUp}
          placeholder={!configured ? "Hoot is not configured: add OPENROUTER_API_KEY" : catchingUp ? "Waiting for the current answer…" : "Ask about a holding, a filing, a move…"}
          sees={`${holding.ticker} research board`}
        />
      </CenterColumn>
      <SideColumn>
        <SideTabs
          tab={tab}
          setTab={setTab}
          sourceCount={sources.length}
          boardCount={boardCount}
          board={boardTab}
          sources={
            <>
              <div className="mb-2 text-[11.5px] text-muted-foreground">{sub}</div>
              {!active || (sources.length === 0 && !live) ? (
                <EmptySources />
              ) : (
                <ul className="flex flex-col gap-2">
                  {sources.map((row) => (
                    <li key={row.source.id}>
                      <BoardSourceCard
                        row={row}
                        isOpen={open.has(row.source.id)}
                        hot={hover === row.source.id}
                        copied={copied === row.source.id}
                        onToggle={() => toggle(row.source.id)}
                        onHover={setHover}
                        onCopy={() => void copyCitation(row.source)}
                        onView={() => setViewer(row.source)}
                      />
                    </li>
                  ))}
                  {live && (
                    <li className="flex items-center gap-2 rounded-[10px] border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3 shrink-0 animate-spin" />
                      {active ? stepLabel(active) : "Working…"}
                    </li>
                  )}
                </ul>
              )}
            </>
          }
        />
        <SourceViewer source={viewer} chatId={chatId} onClose={() => setViewer(null)} />
      </SideColumn>
    </>
  );
}

/**
 * One source behind the selected answer: pink number, title (or the figure, for a quote or relative move),
 * "publisher · date". Click to read the cited passage, open the document, or copy the citation.
 */
function BoardSourceCard({
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
  const snippet = s.excerpt?.trim();
  const toneClass = figure?.tone === "up" ? "text-up" : figure?.tone === "down" ? "text-down" : "text-foreground";
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
        "flex cursor-pointer gap-2.5 rounded-[10px] bg-card px-3 py-[9px] transition-shadow animate-in fade-in duration-200",
        isOpen || hot ? "shadow-[0_0_0_1.5px_var(--hoot-foreground)]" : "shadow-[0_0_0_1px_var(--border)]",
      )}
    >
      <SourceNumber n={row.n} className={cn(isOpen && "bg-hoot-foreground text-hoot", target.kind === "unavailable" && "bg-destructive/10 text-destructive")} />
      <div className="min-w-0 flex-1">
        {figure ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("font-mono text-[15px] font-medium tracking-[-0.02em] tabular-nums", toneClass)}>{figure.big}</span>
            <span className="text-[11.5px] text-muted-foreground">{figure.sub}</span>
          </div>
        ) : (
          <div className="text-[13px] leading-[1.35]">{s.title?.trim() || "Untitled source"}</div>
        )}
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{meta}</div>
        {isOpen && (
          <div onClick={(e) => e.stopPropagation()} className="cursor-auto">
            <div className="mt-2 text-[11px] text-muted-foreground">
              {figure ? "Market data" : sourceType(s)} · {row.cited ? `cited ${row.cited}×` : "not cited"}
            </div>
            <div className="mt-1.5 rounded-lg bg-background px-2.5 py-2 text-[12.5px] leading-relaxed text-foreground/85 shadow-[0_0_0_1px_var(--border)]">
              {snippet ? (
                <mark className="rounded-sm bg-caution px-0.5 text-foreground">{snippet}</mark>
              ) : (
                <span className="text-muted-foreground">No supporting passage was saved for this source. Open it to review the document.</span>
              )}
              {(s.location?.section || s.location?.page) && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">{[s.location.section, s.location.page ? `Page ${s.location.page}` : null].filter(Boolean).join(" · ")}</div>
              )}
            </div>
            <div className="mt-2 flex gap-3.5 text-xs text-muted-foreground">
              {target.kind === "external" ? (
                <a href={target.href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
                  Open source ↗
                </a>
              ) : target.kind === "document" ? (
                <button type="button" onClick={onView} className="font-medium text-foreground hover:underline">
                  Open document
                </button>
              ) : (
                <span className="text-destructive">Source unavailable</span>
              )}
              <button type="button" onClick={onCopy} className="hover:text-foreground">
                {copied ? "Copied" : "Copy citation"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
