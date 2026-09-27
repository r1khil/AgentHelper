"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { TraceHeader } from "./trace-panel";
import { ResearchAnswer, ResearchSources, useSourceViewer } from "./research-answer";
import { useResearchChat } from "./use-research-chat";
import { ActivityRow, Composer, SourceListCard, SourcesHeading, ThinkingRow, ThreadHeader, ThreadNote, UserBubble } from "./thread-parts";
import { clearHootQuestion, peekHootQuestion } from "@/components/app/hoot/handoff";
import { HootHero } from "@/components/app/hoot/hoot-hero";
import { HootOnPage } from "@/components/app/hoot/presence";
import { CenterColumn, ListColumn, ResearchGrid, SideColumn } from "@/components/app/agent/research-columns";
import { collectSources } from "@/lib/agent/citations";
import { pageContextFromMessages, pageContextLabel, parsePageContext } from "@/lib/agent/page-context";
import { splitAssistantParts } from "@/lib/agent/turn";
import type { RunStatus } from "@/lib/chats";
import type { TraceView } from "./trace-panel";

export { ActivityRow } from "./thread-parts";

const SUGGESTIONS = [
  "What moved {T} today versus the S&P 500, and what filings or news are in the window?",
  "Summarize the last 10-Q for {T}: revenue, margins, and guidance, with sources.",
  "Summarize the team's initiating coverage report on {T}: recorded thesis, key drivers, and what would break it, with citations.",
  "When does {T} report next? Pull the prior quarter's release and the key questions the team noted.",
  "Explain how to read the segment disclosure in {T}'s latest 10-K.",
];

/** Starter questions for a general conversation, written about one of the scope's tickers. */
export function chatSuggestions(ticker: string | undefined) {
  const t = ticker ?? "NVDA";
  return SUGGESTIONS.map((s) => s.replaceAll("{T}", t));
}

type ChatProps = {
  chatId: string;
  initialMessages: UIMessage[];
  initialRunStatus: RunStatus;
  tickers: string[];
  configured: boolean;
  /** Exec/admin transparency mode: the server streams a live trace and this panel renders it. */
  transparency?: boolean;
  /** "Hoot can see: …" when the chat wasn't handed a page. */
  sees?: string;
};

/** The chat's state, the handoff of a question left by ⌘K or the companion, and following the answer as it streams. */
function useGeneralChat({ chatId, initialMessages, initialRunStatus, transparency = false }: ChatProps) {
  const chat = useResearchChat({ chatId, initialMessages, initialRunStatus, transparency });
  const { messages, status, catchingUp, send } = chat;
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

  return { ...chat, input, setInput, bottomRef, sources, submit };
}

type GeneralChat = ReturnType<typeof useGeneralChat>;

/** The thread and the composer. */
function Thread({ chat, tickers, configured, sees }: { chat: GeneralChat; tickers: string[]; configured: boolean; sees?: string }) {
  const { messages, status, streaming, busy, catchingUp, runError, requestError, traceView, now, stopWatching, input, setInput, bottomRef, submit } = chat;
  const last = messages[messages.length - 1];
  const ctx = pageContextFromMessages(messages);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-6 py-6 xl:px-14">
          {messages.length === 0 && <EmptyIntro suggestions={chatSuggestions(tickers[0])} onPick={setInput} disabled={!configured} />}
          {messages.map((m) => (
            <Message key={m.id} message={m} live={m === last && status === "streaming"} trace={m === last && m.role === "assistant" ? traceView : null} now={now} />
          ))}
          {status === "submitted" && <ThinkingRow>Thinking…</ThinkingRow>}
          {traceView && (status === "submitted" || last?.role !== "assistant") && <TraceHeader view={traceView} now={now} />}
          {catchingUp && <ThinkingRow>Still working on the last question. The answer will appear here when it is ready; you can leave and come back.</ThinkingRow>}
          {runError && <ThreadNote tone="caution">{runError}</ThreadNote>}
          {requestError && <ThreadNote tone="error">{requestError}</ThreadNote>}
          <div ref={bottomRef} />
        </div>
      </div>
      <Composer
        value={input}
        onChange={setInput}
        onSend={submit}
        onStop={stopWatching}
        streaming={streaming}
        disabled={!configured || catchingUp}
        sendDisabled={busy}
        placeholder={configured ? (catchingUp ? "Waiting for the current answer…" : "Ask about a holding, a filing, a move…") : "Hoot is not configured: add OPENROUTER_API_KEY"}
        sees={ctx ? pageContextLabel(ctx) : sees}
      />
    </>
  );
}

/** The sources every answer in the thread cites, in citation-number order. */
function SourceList({ sources }: { sources: GeneralChat["sources"] }) {
  const view = useSourceViewer();
  return (
    <>
      <SourcesHeading count={sources.size} />
      <div className="-mx-1 mt-2.5 min-h-0 flex-1 overflow-y-auto px-1 pt-px pb-1">
        {sources.size === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">Sources Hoot reads appear here, numbered the way the answer cites them.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...sources.values()].map((s, i) => (
              <li key={s.id} id={`src-${s.id}`}>
                <SourceListCard n={i + 1} source={s} onView={view} />
              </li>
            ))}
          </ul>
        )}
        {sources.size > 0 && <p className="mt-3 text-[11.5px] text-muted-foreground">Hover a number in the answer to preview its source. A red number means the source is unavailable.</p>}
      </div>
    </>
  );
}

/** A chat on its own (a sell-side call's saved chat): the thread in a panel with its sources beside it. */
export function ChatPanel(props: ChatProps) {
  const chat = useGeneralChat(props);
  return (
    <ResearchSources sources={chat.sources} chatId={props.chatId}>
      <div className="flex h-[calc(100vh-7rem)] min-h-[480px] gap-4">
        <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
          <Thread chat={chat} tickers={props.tickers} configured={props.configured} sees={props.sees} />
        </section>
        <aside className="hidden w-[288px] shrink-0 flex-col lg:flex">
          <SourceList sources={chat.sources} />
        </aside>
      </div>
    </ResearchSources>
  );
}

/**
 * A general conversation in Research › Conversations: the list on the left, the thread in the middle, its sources on
 * the right.
 */
export function ChatWorkspace({
  sidebar,
  title,
  team,
  author,
  actions,
  ...props
}: ChatProps & {
  /** The left column's content (the conversation list). */
  sidebar: ReactNode;
  title: string;
  team: string;
  author: string | null;
  /** Header actions on the right: the Trace toggle for execs and admins, Delete. */
  actions?: ReactNode;
}) {
  const chat = useGeneralChat(props);
  const questions = chat.messages.filter((m) => m.role === "user").length;
  const first = chat.messages.find((m) => m.role === "user");
  const firstText = first?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").replace(/\s+/g, " ").trim();
  const shown = title === "New chat" ? firstText?.slice(0, 80) || "New conversation" : title;
  const meta = [team, author, `${questions} question${questions === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
  return (
    <ResearchSources sources={chat.sources} chatId={props.chatId}>
      <ResearchGrid>
        <ListColumn>{sidebar}</ListColumn>
        <CenterColumn>
          <ThreadHeader title={shown} meta={meta}>
            {actions}
          </ThreadHeader>
          <Thread chat={chat} tickers={props.tickers} configured={props.configured} sees={props.sees} />
        </CenterColumn>
        <SideColumn>
          <SourceList sources={chat.sources} />
        </SideColumn>
      </ResearchGrid>
    </ResearchSources>
  );
}

function EmptyIntro({ suggestions, onPick, disabled }: { suggestions: string[]; onPick: (s: string) => void; disabled?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[560px] pt-4 text-center">
      <HootOnPage />
      <HootHero size={112} className="mx-auto mb-1" />
      <div className="text-[15px] font-semibold">Ask for evidence, not conclusions</div>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Hoot pulls prices, SEC filings, financials, news, and your team&rsquo;s notes, with a source on every fact. It will not write your update or thesis.
      </p>
      <div className="mt-5 grid gap-2 text-left">
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

function Message({ message, live, trace, now }: { message: UIMessage; live: boolean; trace: TraceView | null; now: number }) {
  const meta = (message.metadata ?? {}) as { uncited?: number; page?: unknown };

  if (message.role === "user") {
    return (
      <UserBubble page={parsePageContext(meta.page)}>
        {message.parts.map((p, i) => (p.type === "text" ? <p key={i}>{p.text}</p> : null))}
      </UserBubble>
    );
  }

  const { activity, answer } = splitAssistantParts(message.parts);
  return (
    <div className="flex flex-col gap-3">
      {(activity.length > 0 || trace || (live && answer.length === 0)) && <ActivityRow parts={activity} live={live && answer.length === 0} trace={trace} now={now} thinking />}
      {answer.map((p, i) => (
        <ResearchAnswer key={i} text={p.text} className="max-w-[700px] text-[15px] leading-[1.65] [&_p]:my-2.5 [&_p:first-child]:mt-0" />
      ))}
      {!live && meta.uncited !== undefined && meta.uncited > 0 && (
        <div className="text-[11.5px] text-caution-foreground">
          {meta.uncited} sentence{meta.uncited === 1 ? "" : "s"} with numbers carry no citation (heuristic). Check them against the sources.
        </div>
      )}
    </div>
  );
}
