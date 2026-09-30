"use client";

import { useApplyHootAction, useHootCommand } from "@/components/app/hoot/use-hoot-command";
import { seenActions, takeNewActions } from "@/lib/hoot/app-actions";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const runCommand = useHootCommand();
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

  // Hoot's app actions (open a page, change the theme) run once, as they stream in. Saved ones, and any that arrive
  // through the catch-up poll after the member came back, are only marked seen: reopening a chat never navigates.
  const applyAction = useApplyHootAction();
  const seen = useRef<Set<string> | null>(null);
  seen.current ??= seenActions(initialMessages);
  useEffect(() => {
    const fresh = takeNewActions(messages, seen.current!);
    if (streaming) for (const action of fresh) applyAction(action, { chatId, messages });
  }, [messages, streaming, applyAction, chatId]);

  // How long each question this page asked took, for "Worked for 12s" until the saved answer carries its own time.
  // Keyed by the question's message id, which is also the turn's id.
  const asked = useRef<{ at: number; id: string } | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  useEffect(() => {
    const a = asked.current;
    if (!a) return;
    if ((status === "submitted" || status === "streaming") && !a.id) a.id = [...messages].reverse().find((m) => m.role === "user")?.id ?? "";
    if (status === "ready" && a.id) {
      const ms = Date.now() - a.at;
      asked.current = null;
      setDurations((d) => ({ ...d, [a.id]: ms }));
    }
  }, [status, messages]);

  // Stop was pressed on the current run (reset by the next question).
  const [stopping, setStopping] = useState(false);
  const send = useCallback(
    (text: string, page?: PageContext | null) => {
      const t = text.trim();
      if (!t || busy) return false;
      if (runCommand(t)) return true;
      setRunError(null);
      setStopping(false);
      setTrace([]);
      asked.current = { at: Date.now(), id: "" };
      void sendMessage(page ? { text: t, metadata: { page } } : { text: t });
      return true;
    },
    [busy, sendMessage, runCommand],
  );

  // Stop ends the run on the server (it saves what it had). The page stays attached so the answer visibly ends there,
  // then reloads the saved turn. If the request can't get through, the page just stops following, as before.
  const stopRun = useCallback(async () => {
    if (stopping && busy) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/chat/${chatId}/stop`, { method: "POST" });
      // 409: it had already finished.
      if (!res.ok && res.status !== 409) throw new Error(await res.text());
    } catch (e) {
      console.error("[chat] stop failed", e);
      stop();
    }
    setCatchingUp(true);
  }, [busy, chatId, stop, stopping]);

  const requestError = error && !isStillWorking(error) ? error.message : null;

  return { messages, status, streaming, busy, catchingUp, runError, requestError, traceView, now, durations, send, stopRun, stopping: stopping && busy };
}
