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

/** After an answer, Hoot notes his next questions a few seconds later; look for them this often, this many times. */
const RELATED_EVERY_MS = 5000;
const RELATED_TRIES = 5;

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
  pin?: { chatId: string; targets: PinTarget[]; onPinned?: () => void } | null;
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

/**
 * Hoot's next questions for the chat, once he has noted them (a few seconds after an answer): the answer panel's "Ask
 * next" and a thread's "Related" after a new question. Empty until then, and cleared by the next question.
 */
export function useRelated(chatId: string, answered: boolean, turns: number, stale: readonly string[] = []): string[] {
  const [found, setFound] = useState<{ chatId: string; turns: number; questions: string[] } | null>(null);
  // What the previous answer left behind is not this answer's: wait for a list that differs from it.
  const old = useRef(new Set(stale));
  useEffect(() => {
    if (!answered) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      tries++;
      try {
        const res = await fetch(`/api/chat/${chatId}?related=1`, { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { related?: string[] }) : null;
        if (cancelled) return;
        if (data?.related?.length && !data.related.some((q) => old.current.has(q))) {
          data.related.forEach((q) => old.current.add(q));
          return setFound({ chatId, turns, questions: data.related });
        }
      } catch {
        // Offline: no suggestions.
      }
      if (!cancelled && tries < RELATED_TRIES) timer = setTimeout(look, RELATED_EVERY_MS);
    };
    timer = setTimeout(look, RELATED_EVERY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, answered, turns]);
  // Suggestions belong to the answer they followed; a new question clears them.
  return found && found.chatId === chatId && found.turns === turns ? found.questions : [];
}
