"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { PageHead } from "@/components/app/page-head";
import { useSourceViewer, ResearchSources } from "./research-answer";
import { Composer, HootFace, SourceListCard, SourcesHeading } from "./thread-parts";
import { ConversationTurns, useConversation, type Conversation } from "./conversation";
import type { PinTarget } from "./pin-to-board";
import { fmtTime } from "@/lib/format";
import { isMemberQuestion } from "@/lib/agent/hidden-prompt";
import { pageContextFromMessages, pageContextLabel } from "@/lib/agent/page-context";
import type { RunStatus } from "@/lib/chats";
import { cn } from "@/lib/utils";

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

const LEARNING_BOUNDARY = "Hoot finds and cites the evidence. The analysis and the write-ups stay yours.";

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

/** Follow the answer to the bottom of the scroller as it arrives. */
function useFollow(conv: Conversation) {
  const bottom = useRef<HTMLDivElement>(null);
  const { messages, status, catchingUp } = conv;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, status, catchingUp]);
  return bottom;
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
  const bottom = useFollow(conv);
  return (
    <ResearchSources sources={conv.allSources} chatId={props.chatId}>
      <div className="flex h-[calc(100vh-7rem)] min-h-[480px] gap-8">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            {conv.messages.length === 0 && <EmptyIntro suggestions={chatSuggestions(props.tickers[0])} onPick={conv.setInput} disabled={!props.configured} />}
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
 * A Hoot thread, drawn like Perplexity: the question as a grey bubble, what Hoot did, the sources he read as cards, his
 * cited answer in serif, and the follow-up box fixed at the bottom over a white fade. General conversations live at
 * /hoot/<id>; a holding's chats open on its board instead.
 */
export function ChatWorkspace({
  title,
  team,
  teamSlug,
  author,
  updatedAt,
  researchHref,
  actions,
  related,
  pinTargets,
  ...props
}: ChatProps & {
  title: string;
  team: string;
  /** The team the conversation is filed under, for the pages a team-scope lookup opens. */
  teamSlug: string;
  author: string | null;
  updatedAt?: string;
  /** Where "Research" in the breadcrumb goes: the list of chats and boards in the scope the member is in. */
  researchHref: string;
  /** Header actions on the right: Share, Trace for execs and admins, Delete. */
  actions?: ReactNode;
  /** Suggested next questions from Hoot's research log. */
  related?: string[];
  /** Holdings this conversation can be pinned to. */
  pinTargets?: PinTarget[];
}) {
  const conv = useConversation(props);
  const bottom = useFollow(conv);
  const questions = conv.messages.filter(isMemberQuestion).length;
  const first = conv.messages.find(isMemberQuestion);
  const firstText = first?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").replace(/\s+/g, " ").trim();
  const shown = title === "New chat" ? firstText?.slice(0, 80) || "New conversation" : title;
  const asof = [team, author, `${questions} question${questions === 1 ? "" : "s"}`, updatedAt ? fmtTime(updatedAt) : null].filter(Boolean).join(" · ");
  return (
    <div data-full-bleed className="flex h-dvh min-h-0 flex-col">
      <PageHead crumbs={[{ label: "Research", href: researchHref }, { label: shown }]} tabs={false} asof={asof} actions={actions} />
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto">
          <article className="mx-auto flex w-full max-w-[840px] flex-col px-10 pt-[30px] pb-48">
            {conv.messages.length === 0 && <EmptyIntro suggestions={chatSuggestions(props.tickers[0])} onPick={conv.setInput} disabled={!props.configured} />}
            <ConversationTurns conv={conv} variant="thread" teamSlug={teamSlug} pin={pinTargets?.length ? { chatId: props.chatId, targets: pinTargets } : null} related={related} />
            <div ref={bottom} />
          </article>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center bg-linear-to-b from-transparent to-background to-35% px-10 pt-6 pb-4">
          <div className={cn("pointer-events-auto w-[760px] max-w-full")}>
            <Composer variant="thread" {...composerProps(conv, props)} />
          </div>
          <p className="pointer-events-auto mt-1.5 text-caption text-muted-foreground">{LEARNING_BOUNDARY}</p>
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
            className={cn("rounded-md bg-secondary px-3 py-1.5 text-left text-body text-ink-3 transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60")}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
