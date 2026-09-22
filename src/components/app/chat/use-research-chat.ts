"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { AgentUIMessage, TraceEvent } from "@/lib/trace/events";
import type { PageContext } from "@/lib/agent/page-context";
import type { RunStatus } from "@/lib/chats";
import { buildTraceView, type TraceView } from "./trace-panel";

const POLL_MS = 2500;
/** Trace events kept per turn; a long research turn is a few hundred. */
const TRACE_CAP = 2000;

export const isStillWorking = (e: Error) => e.message.includes("still working");

/**
 * One research chat: the streaming connection, the catch-up poll for a run that continued server-side
 * while this page was away, and the live transparency trace. Shared by every chat surface.
 */
export function useResearchChat({
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
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({ body: { chatId: id, message: messages[messages.length - 1] } }),
      }),
    [],
  );
  // True while the server is still answering but this page is not attached to the stream
  // (the analyst navigated away and came back, or pressed stop). We poll until it finishes.
  const [catchingUp, setCatchingUp] = useState(initialRunStatus === "running");
  // Live trace of the current turn (transparency mode only). Transient parts: never in `messages`, never persisted.
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const { messages, sendMessage, setMessages, status, error, stop } = useChat<AgentUIMessage>({
    id: chatId,
    messages: initialMessages as AgentUIMessage[],
    transport,
    // A "still working" 409 means another tab or an earlier visit started a run: catch up instead of erroring.
    onError: (e) => {
      if (isStillWorking(e)) setCatchingUp(true);
    },
    onData: (part) => {
      if (part.type === "data-trace") setTrace((prev) => (prev.length >= TRACE_CAP ? prev : [...prev, part.data]));
    },
  });
  const traceView: TraceView | null = useMemo(() => (transparency && trace.length > 0 ? buildTraceView(trace) : null), [transparency, trace]);
  // Tick the elapsed clock while the trace is live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!traceView || traceView.finished) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [traceView]);
  const [runError, setRunError] = useState<string | null>(initialRunStatus === "error" ? "The previous answer did not finish. Ask again." : null);

  // Catch up on a run that continued server-side while this page was away.
  useEffect(() => {
    if (!catchingUp) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/chat/${chatId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { runStatus: RunStatus; messages: UIMessage[] };
        if (cancelled) return;
        if (data.runStatus !== "running") {
          setMessages(data.messages as AgentUIMessage[]);
          setCatchingUp(false);
          if (data.runStatus === "error") setRunError("The previous answer did not finish. Ask again.");
        }
      } catch (e) {
        if (!cancelled) console.error("[chat] poll failed", e);
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [catchingUp, chatId, setMessages]);

  const streaming = status === "submitted" || status === "streaming";
  const busy = streaming || catchingUp;

  const send = useCallback(
    (text: string, page?: PageContext | null) => {
      const t = text.trim();
      if (!t || busy) return false;
      setRunError(null);
      setTrace([]);
      void sendMessage(page ? { text: t, metadata: { page } } : { text: t });
      return true;
    },
    [busy, sendMessage],
  );

  const stopWatching = useCallback(() => {
    // The server keeps going and saves the answer; this page just stops streaming and polls for the result.
    stop();
    setCatchingUp(true);
  }, [stop]);

  const requestError = error && !isStillWorking(error) ? error.message : null;

  return { messages, status, streaming, busy, catchingUp, runError, requestError, traceView, now, send, stopWatching };
}
