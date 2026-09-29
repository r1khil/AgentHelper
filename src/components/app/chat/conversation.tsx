"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { clearHootQuestion, peekHootQuestion } from "@/components/app/hoot/handoff";
import { collectSources } from "@/lib/agent/citations";
import { pairTurns, turnSources } from "@/lib/agent/board";
import type { RunStatus } from "@/lib/chats";
import { ThinkingRow, ThreadNote } from "./thread-parts";
import { TurnView, type TurnVariant } from "./turn-view";
import type { PinTarget } from "./pin-to-board";
import { useResearchChat } from "./use-research-chat";

/** The words the "Flag a wrong number" control puts in the question box: Hoot re-checks against the sources, the member reads the answer. */
export const FLAG_PROMPT = "One number in your last answer looks wrong. Check it against the sources: ";

/**
 * A conversation as a page or panel draws it: the streaming chat, its turns paired up with their numbered sources, the
 * question box's text, and a question handed over by ⌘J or a page's "Ask Hoot" button, sent once the chat is ready.
 * Deferred a tick because the SDK's sendMessage returns silently if React's development double-invoke stops it
 * mid-flight.
 */
export function useConversation({
  chatId,
  initialMessages,
  initialRunStatus,
  transparency = false,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  initialRunStatus: RunStatus;
  transparency?: boolean;
}) {
  const chat = useResearchChat({ chatId, initialMessages, initialRunStatus, transparency });
  const { messages, send } = chat;
  const [input, setInput] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const asked = peekHootQuestion(chatId);
    if (!asked) return;
    const t = setTimeout(() => {
      if (send(asked.text, asked.page)) clearHootQuestion(chatId);
    }, 0);
    return () => clearTimeout(t);
  }, [chatId, send]);

  const turns = useMemo(() => pairTurns(messages), [messages]);
  const allSources = useMemo(() => collectSources(messages), [messages]);
  const perTurn = useMemo(() => new Map(turns.map((t) => [t.id, turnSources(t, allSources)])), [turns, allSources]);

  const submit = useCallback(() => {
    if (send(input)) setInput("");
  }, [input, send]);
  const flag = useCallback(() => {
    setInput((v) => v || FLAG_PROMPT);
    composerRef.current?.focus();
  }, []);

  return { ...chat, chatId, input, setInput, submit, flag, composerRef, turns, allSources, perTurn };
}

export type Conversation = ReturnType<typeof useConversation>;

/** Every turn of the conversation, then what the run is doing now (reading, catching up, or failed). */
export function ConversationTurns({
  conv,
  variant,
  teamSlug,
  pin,
  related,
  gap = "gap-9",
}: {
  conv: Conversation;
  variant: TurnVariant;
  teamSlug: string | null;
  pin?: { chatId: string; targets: PinTarget[] } | null;
  /** Suggested next questions, shown under the last answer. */
  related?: string[];
  gap?: string;
}) {
  const { turns, perTurn, allSources, status, streaming, catchingUp, runError, requestError, traceView, now, durations, send, flag } = conv;
  const last = turns[turns.length - 1];
  return (
    <div className={`flex flex-col ${gap}`}>
      {turns.map((t) => {
        const isLast = t === last;
        return (
          <TurnView
            key={t.id}
            turn={t}
            variant={variant}
            chatId={conv.chatId}
            allSources={allSources}
            sources={perTurn.get(t.id) ?? []}
            live={streaming && isLast}
            catchingUp={catchingUp}
            trace={isLast ? traceView : null}
            now={now}
            elapsedMs={durations[t.id] ?? null}
            teamSlug={teamSlug}
            pin={pin}
            onFlag={flag}
            related={isLast ? related : undefined}
            onAsk={(q) => void send(q)}
          />
        );
      })}
      {status === "submitted" && !last?.assistant && <ThinkingRow>Reading the question…</ThinkingRow>}
      {catchingUp && <ThinkingRow>Still working on the last question. The answer appears here when it is ready; you can leave and come back.</ThinkingRow>}
      {runError && <ThreadNote tone="caution">{runError}</ThreadNote>}
      {requestError && <ThreadNote tone="error">{requestError}</ThreadNote>}
    </div>
  );
}
