"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { PageHead, type Crumb } from "@/components/app/page-head";
import { useSourceViewer, ResearchSources } from "./research-answer";
import { Composer, HootFace, SourceListCard, SourcesHeading } from "./thread-parts";
import { ConversationTurns, useConversation, useRelated, type Conversation } from "./conversation";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";
import { isCallTitle, threadTitle } from "@/lib/thread-title";
import { isMemberQuestion } from "@/lib/agent/hidden-prompt";
import { pageContextFromMessages, pageContextLabel } from "@/lib/agent/page-context";
import type { RunStatus } from "@/lib/chats";

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

function composerProps(conv: Conversation, { configured, sees }: { configured: boolean; sees?: string }) {
  const ctx = pageContextFromMessages(conv.messages);
  return {
    value: conv.input,
    onChange: conv.setInput,
    onSend: conv.submit,
    onStop: conv.stopWatching,
    streaming: conv.streaming,
    disabled: !configured || conv.catchingUp,
    sendDisabled: conv.busy,
    inputRef: conv.composerRef,
    placeholder: configured ? (conv.catchingUp ? "Waiting for the current answer…" : "Ask a follow-up") : "Hoot isn't set up yet: an admin needs to turn it on",
    sees: ctx ? pageContextLabel(ctx) : sees,
  };
}

/** Within this many pixels of the end, the reader is following the latest and the thread keeps up with the answer. */
const FOLLOW_SLACK = 240;

/**
 * Follow the answer to the bottom of the scroller as it arrives, but only while the reader is at (or near) the end: someone
 * who scrolled up to read earlier text stays where they are. Sending a question always goes to it. Put `onScroll` on
 * the scroller.
 */
function useFollow(conv: Conversation) {
  const bottom = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const { messages, status, catchingUp } = conv;
  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK;
  }, []);
  useEffect(() => {
    if (status === "submitted") following.current = true;
  }, [status]);
  useEffect(() => {
    if (following.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, status, catchingUp]);
  return { bottom, onScroll };
}

/** The sources every answer in the thread cites, in citation-number order: a short list beside a call's chat. */
function SourceList({ sources }: { sources: Conversation["allSources"] }) {
  const view = useSourceViewer();
  return (
    <>
      <SourcesHeading count={sources.size} />
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {sources.size === 0 ? (
          <p className="text-body text-muted-foreground">Sources Hoot reads appear here, numbered the way the answer cites them.</p>
        ) : (
          <div>
            {[...sources.values()].map((s, i) => (
              <div key={s.id} id={`src-${s.id}`}>
                <SourceListCard n={i + 1} source={s} onView={view} />
              </div>
            ))}
          </div>
        )}
        {sources.size > 0 && <p className="mt-3 text-caption text-muted-foreground">Hover a number in the answer to preview its source. An amber number means the source is unavailable.</p>}
      </div>
    </>
  );
}

/** A chat on its own (a sell-side call's saved chat): the thread with its sources beside it. */
export function ChatPanel(props: ChatProps) {
  const conv = useConversation(props);
  const { bottom, onScroll } = useFollow(conv);
  return (
    <ResearchSources sources={conv.allSources} chatId={props.chatId}>
      <div className="flex h-[calc(100vh-7rem)] min-h-[480px] gap-8">
        <section className="flex min-w-0 flex-1 flex-col">
          <div onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pr-2">
            {conv.messages.length === 0 && !conv.handingOff && <EmptyIntro suggestions={chatSuggestions(props.tickers[0])} onPick={conv.setInput} disabled={!props.configured} />}
            <ConversationTurns conv={conv} variant="board" teamSlug={null} gap="gap-6" />
            <div ref={bottom} />
          </div>
          <div className="shrink-0 pt-3">
            <Composer variant="compact" {...composerProps(conv, props)} />
          </div>
        </section>
        <aside className="hidden w-[288px] shrink-0 flex-col border-l pl-6 lg:flex">
          <SourceList sources={conv.allSources} />
        </aside>
      </div>
    </ResearchSources>
  );
}

/**
 * A Hoot thread at /hoot/<id>, drawn like Perplexity: every chat, general or pinned to a holding. The header says where
 * it belongs ("Whole fund", a team, or the holding) and carries its actions; the turns run down a 760px column, each
 * question a heading over its Answer, Sources and Steps; the follow-up box floats at the bottom over the page, with room
 * left under the last answer so it never hides behind it.
 */
export function ChatWorkspace({
  title,
  ticker = null,
  crumbs,
  teamSlug,
  author,
  updatedAt,
  actions,
  related,
  times,
  ...props
}: ChatProps & {
  title: string;
  /** The holding a pinned thread is about (its ticker already leads the breadcrumb). */
  ticker?: string | null;
  /** What the thread belongs to, ahead of its title in the breadcrumb: "Whole fund", a team, or the holding's ticker. */
  crumbs: Crumb[];
  /** The team the conversation is filed under, for the pages a team-scope lookup opens; null for a fund-wide one. */
  teamSlug: string | null;
  author: string | null;
  updatedAt?: string;
  /** Header actions on the right: Trace for execs and admins, Pin to a holding, Delete, and Share (the primary). */
  actions?: ReactNode;
  /** Suggested next questions from Hoot's research log. */
  related?: string[];
  /** When each saved message was written (ISO), by id: "Hoot answered at …". */
  times?: Record<string, string>;
}) {
  const conv = useConversation(props);
  const { bottom, onScroll } = useFollow(conv);
  // The questions the page came with belong to the answers it came with; a new question gets Hoot's next ones for it.
  const [openingTurns] = useState(() => conv.turns.length);
  const last = conv.turns[conv.turns.length - 1];
  const fresh = useRelated(props.chatId, !conv.busy && !!last?.answerText && conv.turns.length > openingTurns, conv.turns.length, related);
  const nextQuestions = conv.turns.length > openingTurns ? fresh : related;
  const questions = conv.messages.filter(isMemberQuestion).length;
  const first = conv.messages.find(isMemberQuestion);
  const firstText = first?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").replace(/\s+/g, " ").trim();
  const shown = title === "New chat" ? firstText?.slice(0, 80) || "New conversation" : threadTitle(title, ticker);
  const asof = [author, isCallTitle(title) && questions === 0 ? null : `${questions} question${questions === 1 ? "" : "s"}`, updatedAt ? `updated ${fmtDay(updatedAt) === fmtDay(new Date()) ? fmtTime(updatedAt) : fmtDateTime(updatedAt)}` : null].filter(Boolean).join(", ");
  return (
    <div data-full-bleed className="flex h-dvh min-h-0 flex-col">
      <PageHead crumbs={[...crumbs, { label: shown }]} tabs={false} asof={asof} actions={actions} />
      <div className="relative min-h-0 flex-1">
        <div onScroll={onScroll} className="h-full overflow-y-auto">
          <article className="mx-auto flex w-full max-w-[840px] flex-col px-10 pt-[34px]">
            {conv.messages.length === 0 && !conv.busy && !conv.handingOff && <EmptyIntro suggestions={chatSuggestions(props.tickers[0])} onPick={conv.setInput} disabled={!props.configured} />}
            <ConversationTurns conv={conv} variant="thread" teamSlug={teamSlug} related={nextQuestions} times={times} />
            {/* Room under the last answer for the floating box; following the answer scrolls to its end. */}
            <div ref={bottom} aria-hidden className="h-40 shrink-0" />
          </article>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-10">
          <div className="pointer-events-auto w-[760px] max-w-full">
            <Composer variant="pill" {...composerProps(conv, props)} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A thread with nothing asked yet: Hoot's face, what to ask, and starter questions that fill the box. */
export function EmptyIntro({ suggestions, onPick, disabled }: { suggestions: string[]; onPick: (s: string) => void; disabled?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col items-center pt-6 pb-8 text-center">
      <HootFace className="size-11" />
      <h2 className="mt-3 font-serif text-display font-normal tracking-[-0.02em]">What should Hoot look into?</h2>
      <p className="mt-1.5 text-body text-ink-2">Prices, SEC filings, financials, news, and your team&rsquo;s notes, with a source on every fact.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
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
