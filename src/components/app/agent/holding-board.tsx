"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { ArrowLeft, ArrowUp, ChevronDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtMoney, relativeTime } from "@/lib/format";
import type { RunStatus } from "@/lib/chats";
import type { Source } from "@/lib/providers/types";
import { collectSources } from "@/lib/agent/citations";
import { marketFigure, pairTurns, stepLabel, traceLine, turnSources, type Turn, type TurnSource } from "@/lib/agent/board";
import { resolveSource, sourceType } from "@/lib/agent/source-resolution";
import { clearHootQuestion, peekHootQuestion } from "@/components/app/hoot/handoff";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { createHoldingChat, deleteChat } from "@/lib/actions/chats";
import { ResearchAnswer, ResearchSources, type CitationLinks } from "@/components/app/chat/research-answer";
import { SourceViewer } from "@/components/app/chat/source-viewer";
import { ActivityRow } from "@/components/app/chat/chat-panel";
import { useResearchChat } from "@/components/app/chat/use-research-chat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemoryEntry } from "@/lib/agent/memory/prompt";
import { ResearchLogCard, suggestionsFor } from "@/components/app/agent/research-log-card";

export type BoardChat = { id: string; title: string; authorName: string | null; questions: number; updatedAt: string; canDelete: boolean };
export type BoardMarket = { price?: number; changePct?: number; relativePp?: number; asOf?: string };

type Props = {
  team: { id: string; slug: string };
  holding: { id: string; ticker: string; name: string };
  market: Promise<BoardMarket>;
  movement: { id: string; dueAt: string | null } | null;
  chats: BoardChat[];
  initialChatId: string | null;
  initialMessages: UIMessage[];
  initialRunStatus: RunStatus;
  configured: boolean;
  transparency: boolean;
  userName: string;
  /** The agent's research log for this holding (newest first). */
  memories: MemoryEntry[];
  /** Whether this user may remove research-log entries. */
  canManage: boolean;
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
 * The research board for one holding: every chat pinned to it on the left, the sources behind the selected
 * answer on the right. Chat switching stays on the client; the URL's `chat` param follows the selection.
 */
export function HoldingBoard(props: Props) {
  const { team, holding, configured, transparency, userName, memories, canManage } = props;
  const suggestions = useMemo(() => suggestionsFor(holding.ticker, memories, SUGGESTIONS), [holding.ticker, memories]);
  const logCard = (defaultOpen: boolean) => (
    <>
      {props.prepCard}
      <ResearchLogCard entries={memories} canManage={canManage} defaultOpen={defaultOpen} />
    </>
  );
  const [chats, setChats] = useState(props.chats);
  const [chatId, setChatId] = useState(props.initialChatId);
  const [cache, setCache] = useState<Record<string, ChatState>>(() => (props.initialChatId ? { [props.initialChatId]: { messages: props.initialMessages, runStatus: props.initialRunStatus } } : {}));
  const [loading, setLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The first question of a chat created from the empty state; sent as soon as the thread mounts.
  const [autoSend, setAutoSend] = useState<{ chatId: string; text: string } | null>(null);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const chat = chats.find((c) => c.id === chatId) ?? null;
  const boardPath = `/t/${team.slug}/agent/h/${holding.ticker}`;
  const syncUrl = (id: string | null, push: boolean) => {
    const url = id ? `${boardPath}?chat=${id}` : boardPath;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };

  const selectChat = useCallback(
    async (id: string) => {
      setChatsOpen(false);
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
    setChatsOpen(false);
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

  /** Mirror the server's titling and counts so the switcher reads right before the next full load. */
  const onSent = (id: string, text: string) => {
    const now = new Date().toISOString();
    setChats((cs) =>
      cs.map((c) => (c.id === id ? { ...c, title: c.questions === 0 && c.title === "New chat" ? text.replace(/\s+/g, " ").trim().slice(0, 80) : c.title, questions: c.questions + 1, updatedAt: now } : c)),
    );
  };

  const header = (
    <>
      <div className="flex items-center gap-2 text-[12.8px] text-muted-foreground">
        <Link href={`/t/${team.slug}/agent`} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Hoot
        </Link>
        {chat && chat.canDelete && (
          <form
            action={deleteChat}
            className="ml-auto"
            onSubmit={(e) => {
              if (!confirm("Clear this chat? Its questions, answers, and sources are removed for the whole team.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={chat.id} />
            <button type="submit" className="whitespace-nowrap hover:text-down">
              Clear chat
            </button>
          </form>
        )}
      </div>
      <div className="mt-4 flex items-baseline gap-2.5">
        <span className="text-2xl leading-7 font-semibold tracking-tight">{holding.ticker}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{holding.name}</span>
        <Suspense fallback={<Skeleton className="ml-auto h-4 w-14" />}>
          <HeaderQuote market={props.market} />
        </Suspense>
      </div>
      <div className="relative mt-3.5 flex items-center gap-2 text-xs leading-4">
        <button
          type="button"
          onClick={() => setChatsOpen((v) => !v)}
          aria-expanded={chatsOpen}
          aria-haspopup="listbox"
          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2.5 hover:bg-muted/50"
        >
          <span className="min-w-0 flex-1 truncate text-left font-medium">{loading ? "Loading…" : chat ? chat.title : "New chat"}</span>
          <span className="whitespace-nowrap text-muted-foreground">{chats.length ? `${chats.length} chat${chats.length === 1 ? "" : "s"}` : "no chats yet"}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={newChat}
          disabled={!chat && !loading}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap disabled:opacity-60",
            chat || loading ? "border bg-background hover:bg-muted/50" : "bg-primary text-primary-foreground",
          )}
        >
          <Plus className="size-3" />
          New chat
        </button>
        {chatsOpen && chats.length > 0 && (
          <ul role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1.5 overflow-hidden rounded-lg border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
            {chats.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === chatId}
                  onClick={() => void selectChat(c.id)}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.8px] hover:bg-muted", c.id === chatId && "bg-muted font-medium")}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {c.questions} question{c.questions === 1 ? "" : "s"} · {relativeTime(c.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {loadError && <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">{loadError}</div>}
    </>
  );

  const state = chatId ? cache[chatId] : undefined;
  return (
    <div data-full-bleed className="flex h-[calc(100dvh-3.25rem)] min-w-0 flex-col overflow-hidden bg-background text-sm md:h-screen lg:flex-row" onClick={() => chatsOpen && setChatsOpen(false)}>
      {chatId && state ? (
        <BoardThread
          key={chatId}
          chatId={chatId}
          header={header}
          holding={holding}
          movement={props.movement}
          initial={state}
          configured={configured}
          transparency={transparency}
          autoSend={autoSend?.chatId === chatId ? autoSend.text : null}
          onSent={(text) => onSent(chatId, text)}
          suggestions={suggestions}
          logCard={logCard(false)}
        />
      ) : (
        <EmptyBoard header={header} holding={holding} movement={props.movement} configured={configured} busy={starting || loading !== null} hasChats={chats.length > 0} onAsk={start} suggestions={suggestions} logCard={logCard(true)} />
      )}
    </div>
  );
}

function HeaderQuote({ market }: { market: Promise<BoardMarket> }) {
  const m = use(market);
  if (m.changePct === undefined) return null;
  const tone = m.changePct > 0.005 ? "text-up" : m.changePct < -0.005 ? "text-down" : "text-muted-foreground";
  return (
    <span className={cn("tnum ml-auto flex shrink-0 items-baseline gap-2 font-medium", tone)} title={m.asOf ? `As of ${fmtDateTime(m.asOf)}` : undefined}>
      {m.price !== undefined && <span className="text-xs font-normal text-muted-foreground">{fmtMoney(m.price)}</span>}
      {m.changePct < 0 ? `(${Math.abs(m.changePct).toFixed(2)}%)` : `${m.changePct > 0 ? "+" : ""}${m.changePct.toFixed(2)}%`}
    </span>
  );
}

/** Two columns: the thread on the left, sources on the right. */
function BoardFrame({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <>
      <div className="flex min-h-0 shrink-0 flex-col border-b px-6 pt-6 pb-5 lg:h-full lg:w-[380px] lg:border-r lg:border-b-0">{left}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">{right}</div>
    </>
  );
}

function SourcesHeader({ sub, movement }: { sub: string; movement: Props["movement"] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 pt-6">
      <span className="font-semibold whitespace-nowrap">Sources</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
      {movement && (
        <Link
          href={`?`}
          onClick={(e) => e.preventDefault()}
          className="ml-auto inline-flex h-5 items-center rounded-full border border-down/40 bg-down/10 px-2 text-[11px] font-medium whitespace-nowrap text-down"
        >
          Movement open{movement.dueAt ? ` · due ${fmtDateTime(movement.dueAt)}` : ""}
        </Link>
      )}
    </div>
  );
}

function EmptyBoard({
  header,
  holding,
  movement,
  configured,
  busy,
  hasChats,
  onAsk,
  suggestions,
  logCard,
}: {
  header: ReactNode;
  holding: Props["holding"];
  movement: Props["movement"];
  configured: boolean;
  busy: boolean;
  hasChats: boolean;
  onAsk: (text: string) => void;
  suggestions: string[];
  logCard: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  return (
    <BoardFrame
      left={
        <>
          {header}
          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto">
            <div className="font-medium">{hasChats ? `New chat about ${holding.ticker}` : `Start a chat about ${holding.ticker}`}</div>
            <div className="text-muted-foreground">Ask anything about this holding. Sources for each answer appear on the right; the answer cites them by number.</div>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button key={s} type="button" disabled={busy || !configured} onClick={() => onAsk(s)} className="rounded-lg border px-3 py-2 text-left text-[13px] leading-[18px] hover:bg-muted disabled:opacity-60">
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => {
              if (draft.trim()) onAsk(draft);
            }}
            disabled={busy || !configured}
            placeholder={configured ? `Ask about ${holding.ticker}…` : "Hoot is not configured: add OPENROUTER_API_KEY"}
          />
        </>
      }
      right={
        <>
          {logCard}
          <SourcesHeader sub="Empty until you ask" movement={movement} />
          <EmptySources />
        </>
      }
    />
  );
}

function EmptySources() {
  return (
    <div className="m-6 grid flex-1 place-items-center rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">
      <p>
        Sources appear here as Hoot reads them.
        <br />
        Click a card, or a number in the answer, to read the cited passage.
      </p>
    </div>
  );
}

function Composer({ value, onChange, onSend, onStop, disabled, streaming, placeholder }: { value: string; onChange: (v: string) => void; onSend: () => void; onStop?: () => void; disabled: boolean; streaming?: boolean; placeholder: string }) {
  return (
    <form
      className="mt-3.5 flex items-end gap-2 rounded-lg border bg-background px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        aria-label="Question"
        className="min-h-10 flex-1 resize-none bg-transparent leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />
      {streaming && onStop ? (
        <Button type="button" variant="outline" size="icon-sm" onClick={onStop} aria-label="Stop">
          <span className="size-2.5 rounded-sm bg-foreground" />
        </Button>
      ) : (
        <Button type="submit" size="icon-sm" disabled={disabled || !value.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      )}
    </form>
  );
}

function BoardThread({
  chatId,
  header,
  holding,
  movement,
  initial,
  configured,
  transparency,
  autoSend,
  onSent,
  suggestions,
  logCard,
}: {
  chatId: string;
  header: ReactNode;
  holding: Props["holding"];
  movement: Props["movement"];
  initial: ChatState;
  configured: boolean;
  transparency: boolean;
  autoSend: string | null;
  onSent: (text: string) => void;
  suggestions: string[];
  logCard: ReactNode;
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

  const toggle = (id: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  /** A chip click opens its card and brings it into view; a long answer can have cards below the fold. */
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
      : `${sources.length} for ${turns.length > 1 ? "the selected answer" : "this answer"}`;

  return (
    <>
      <BoardFrame
        left={
          <>
            {header}
            {turns.length === 0 ? (
              <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto">
                <div className="font-medium">New chat about {holding.ticker}</div>
                <div className="text-muted-foreground">Ask anything about this holding. Sources for each answer appear on the right; the answer cites them by number.</div>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy || !configured}
                      onClick={() => {
                        if (send(s)) onSent(s);
                      }}
                      className="rounded-lg border px-3 py-2 text-left text-[13px] leading-[18px] hover:bg-muted disabled:opacity-60"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div ref={threadRef} className="mt-5 flex min-h-0 flex-1 flex-col gap-6 overflow-auto">
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
                  const trace = traceLine(t, turnLive);
                  return (
                    <div
                      key={t.id}
                      onClick={() => activate(t)}
                      className={cn("border-l-2 pl-3 transition-colors", isActive ? "border-primary" : "cursor-pointer border-border")}
                    >
                      <div className="font-medium">{t.question}</div>
                      {t.answerText ? (
                        <ResearchSources sources={allSources} numbers={numbers} links={links} chatId={chatId}>
                          <div className="mt-2.5 leading-relaxed [&_.prose-sm]:leading-relaxed">
                            <ResearchAnswer text={t.answerText} />
                          </div>
                        </ResearchSources>
                      ) : t.assistant && !turnLive && !catchingUp ? (
                        <div className="mt-2 text-xs text-warning-foreground">Hoot stopped before writing an answer. Its lookups are on the right; ask again to get a written answer.</div>
                      ) : null}
                      {(t.assistant || turnLive) && (
                        <div className="tnum mt-1.5 flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
                          {trace.working && <Loader2 className="size-[11px] shrink-0 animate-spin" />}
                          {trace.text}
                        </div>
                      )}
                      {transparency && isActive && t.assistant && (t.activity.length > 0 || traceView) && (
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <ActivityRow parts={t.activity} live={turnLive && !t.answerText} trace={t === last ? traceView : null} now={now} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {status === "submitted" && !last?.assistant && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <HootSprite mood="thinking" size={28} bob /> Reading the question…
                  </div>
                )}
                {catchingUp && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Still working on the last question. The answer appears here when it is ready; you can leave and come back.
                  </div>
                )}
                {runError && <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">{runError}</div>}
                {requestError && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{requestError}</div>}
              </div>
            )}
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={submit}
              onStop={stopWatching}
              streaming={streaming}
              disabled={!configured || catchingUp}
              placeholder={!configured ? "Hoot is not configured: add OPENROUTER_API_KEY" : catchingUp ? "Waiting for the current answer…" : turns.length ? `Follow up on ${holding.ticker}…` : `Ask about ${holding.ticker}…`}
            />
          </>
        }
        right={
          <>
            {logCard}
            <SourcesHeader sub={sub} movement={movement} />
            {!active || (sources.length === 0 && !live) ? (
              <EmptySources />
            ) : (
              <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-auto px-6 pt-4 pb-6 xl:grid-cols-2">
                {sources.map((row) => (
                  <SourceCard
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
                  <div className="flex min-h-[88px] items-center gap-2 rounded-xl border border-dashed px-4 py-3.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                    {active ? stepLabel(active) : "Working…"}
                  </div>
                )}
              </div>
            )}
          </>
        }
      />
      <SourceViewer source={viewer} chatId={chatId} onClose={() => setViewer(null)} />
    </>
  );
}

function SourceCard({
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
  const date = s.publishedAt?.slice(0, 10);
  const snippet = s.excerpt?.trim();
  const toneClass = figure?.tone === "up" ? "text-up" : figure?.tone === "down" ? "text-down" : "text-foreground";
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
        "cursor-pointer self-start rounded-xl bg-card px-4 py-3.5 ring-1 transition-shadow animate-in fade-in slide-in-from-bottom-1 duration-200",
        isOpen || hot ? "ring-[1.5px] ring-foreground/70" : "ring-foreground/10",
        isOpen && "xl:col-span-2",
      )}
    >
      <div className="flex items-center gap-2.5 text-[11px] leading-4 font-semibold tracking-wide text-muted-foreground uppercase">
        <span className={cn("grid size-5 place-items-center rounded-[5px] text-[11px]", isOpen ? "bg-primary text-primary-foreground" : "border bg-muted text-foreground")}>{row.n}</span>
        <span className="whitespace-nowrap">{figure ? "Market data" : sourceType(s)}</span>
        <span className="ml-auto min-w-0 truncate font-normal tracking-normal normal-case">
          {row.cited ? `Cited ${row.cited}×` : "Not cited"} · {s.publisher || "Publisher unavailable"}
        </span>
      </div>
      {figure ? (
        <div className="tnum mt-2 flex flex-wrap items-baseline gap-2">
          <span className={cn("text-[22px] leading-[26px] font-semibold tracking-tight whitespace-nowrap", toneClass)}>{figure.big}</span>
          <span className="text-xs text-muted-foreground">{figure.sub}</span>
        </div>
      ) : (
        <div className="mt-2 font-medium">{s.title?.trim() || "Untitled source"}</div>
      )}
      {!isOpen && !figure && snippet && <div className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">{snippet}</div>}
      {isOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mt-2.5 rounded-md border bg-sidebar px-3.5 py-3 text-[13px] leading-relaxed text-foreground/80">
            {snippet ? (
              <mark className="rounded-sm bg-warning/35 px-0.5 text-foreground">{snippet}</mark>
            ) : (
              <span className="text-muted-foreground">No supporting passage was saved for this source. Open it to review the document.</span>
            )}
            {(s.location?.section || s.location?.page) && (
              <div className="mt-2 text-xs text-muted-foreground">
                {[s.location.section, s.location.page ? `Page ${s.location.page}` : null].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-3.5 text-xs leading-4 text-muted-foreground">
            {target.kind === "external" ? (
              <a href={target.href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
                Open source ↗
              </a>
            ) : target.kind === "document" ? (
              <button type="button" onClick={onView} className="font-medium text-foreground hover:underline">
                Open document
              </button>
            ) : (
              <span className="text-down">Source unavailable</span>
            )}
            <button type="button" onClick={onCopy} className="hover:text-foreground">
              {copied ? "Copied" : "Copy citation"}
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 text-xs leading-4 text-muted-foreground">
        {s.publisher || "Publisher unavailable"} · {date || "Date unavailable"}
      </div>
    </div>
  );
}
