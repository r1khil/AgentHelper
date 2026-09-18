"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, ChevronRight, ExternalLink, Loader2, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { collectSources } from "@/lib/agent/citations";
import { isToolPart, splitAssistantParts, summarizeActivity, toolDone, toolFailed, toolName, type Part, type ToolPart } from "@/lib/agent/turn";
import type { RunStatus } from "@/lib/chats";
import type { Source } from "@/lib/providers/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  "What moved {T} today versus the S&P 500, and what filings or news are in the window?",
  "Summarize the last 10-Q for {T}: revenue, margins, and guidance, with sources.",
  "Summarize the team's initiating coverage report on {T}: recorded thesis, key drivers, and what would break it, with citations.",
  "When does {T} report next? Pull the prior quarter's release and the key questions the team noted.",
  "Explain how to read the segment disclosure in {T}'s latest 10-K.",
];

const POLL_MS = 2500;

const isStillWorking = (e: Error) => e.message.includes("still working");

export function ChatPanel({
  chatId,
  initialMessages,
  initialRunStatus,
  tickers,
  configured,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  initialRunStatus: RunStatus;
  tickers: string[];
  configured: boolean;
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
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    // A "still working" 409 means another tab or an earlier visit started a run: catch up instead of erroring.
    onError: (e) => {
      if (isStillWorking(e)) setCatchingUp(true);
    },
  });
  const [input, setInput] = useState("");
  const [runError, setRunError] = useState<string | null>(initialRunStatus === "error" ? "The previous answer did not finish. Ask again." : null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streaming = status === "submitted" || status === "streaming";
  const busy = streaming || catchingUp;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status, catchingUp]);

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
          setMessages(data.messages);
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

  const sources = useMemo(() => collectSources(messages), [messages]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setRunError(null);
    void sendMessage({ text });
  }, [input, busy, sendMessage]);

  function stopWatching() {
    // The server keeps going and saves the answer; this page just stops streaming and polls for the result.
    stop();
    setCatchingUp(true);
  }

  const t = tickers[0] ?? "NVDA";
  const last = messages[messages.length - 1];

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[480px] gap-4">
      <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-10 text-center">
              <div className="text-sm font-medium">Ask for evidence, not conclusions</div>
              <p className="mt-1 text-sm text-muted-foreground">
                The agent pulls prices, SEC filings, financials, news, and your team&rsquo;s notes, with a source on every fact. It will not write your update or thesis.
              </p>
              <div className="mt-5 grid gap-2 text-left">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s.replaceAll("{T}", t))}
                    className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {s.replaceAll("{T}", t)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} sources={sources} live={m === last && status === "streaming"} />
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </div>
          )}
          {catchingUp && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Still working on the last question. The answer will appear here when it is ready; you can leave and come back.
            </div>
          )}
          {runError && <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">{runError}</div>}
          {error && !isStillWorking(error) && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error.message}</div>
          )}
          <div ref={bottomRef} />
        </div>
        <form
          className="border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={configured ? (catchingUp ? "Waiting for the current answer…" : "Ask about a holding, a filing, a move…") : "Agent is not configured: add OPENROUTER_API_KEY"}
              disabled={!configured || catchingUp}
              rows={2}
              className="min-h-10 resize-none"
            />
            {streaming ? (
              <Button type="button" variant="outline" size="icon" onClick={stopWatching} aria-label="Stop">
                <span className="size-2.5 rounded-sm bg-foreground" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim() || !configured || busy} aria-label="Send">
                <ArrowUp />
              </Button>
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            A red &ldquo;unverified&rdquo; chip means the model cited something it never retrieved.
          </div>
        </form>
      </div>

      <aside className="hidden w-72 shrink-0 flex-col rounded-lg border bg-card lg:flex">
        <div className="border-b px-3 py-2 text-xs font-semibold">Sources ({sources.size})</div>
        <div className="flex-1 overflow-y-auto p-2">
          {sources.size === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Sources returned by tools appear here.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...sources.values()].map((s) => (
                <li key={s.id} id={`src-${s.id}`}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="block rounded-md px-2 py-1.5 text-xs hover:bg-muted">
                    <span className="line-clamp-2 font-medium">{s.title}</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {s.publisher}
                      {s.publishedAt ? ` · ${s.publishedAt.slice(0, 10)}` : ""}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function Message({ message, sources, live }: { message: UIMessage; sources: Map<string, Source>; live: boolean }) {
  const isUser = message.role === "user";
  const meta = (message.metadata ?? {}) as { uncited?: number };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.parts.map((p, i) => (p.type === "text" ? <p key={i} className="whitespace-pre-wrap">{p.text}</p> : null))}
        </div>
      </div>
    );
  }

  const { activity, answer } = splitAssistantParts(message.parts);
  return (
    <div className="flex justify-start">
      <div className="w-full space-y-2">
        {activity.length > 0 && <ActivityRow parts={activity} live={live && answer.length === 0} />}
        {answer.map((p, i) => (
          <Prose key={i} text={p.text} sources={sources} />
        ))}
        {!live && meta.uncited !== undefined && meta.uncited > 0 && (
          <div className="text-[11px] text-warning-foreground">
            {meta.uncited} sentence{meta.uncited === 1 ? "" : "s"} with numbers carry no citation (heuristic). Check them against the sources.
          </div>
        )}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_quote: "Quote",
  get_price_history: "Price history",
  get_relative_moves: "Relative moves vs S&P",
  get_filings: "SEC filings",
  read_filing: "Read filing",
  list_filing_documents: "Filing documents",
  search_financial_concepts: "Search XBRL concepts",
  get_financials: "Financials",
  get_key_financials: "Key financials",
  get_news: "News",
  get_earnings_calendar: "Earnings calendar",
  get_team_context: "Team context",
  get_peer_moves: "Peer moves",
  find_drive_files: "Analyst Drive",
  read_drive_file: "Drive file",
};

const TOOL_PROGRESS: Record<string, string> = {
  get_quote: "Fetching quote",
  get_price_history: "Fetching price history",
  get_relative_moves: "Comparing moves with the S&P",
  get_filings: "Listing SEC filings",
  read_filing: "Reading filing",
  list_filing_documents: "Listing filing documents",
  search_financial_concepts: "Searching XBRL concepts",
  get_financials: "Pulling financials",
  get_key_financials: "Pulling key financials",
  get_news: "Scanning news",
  get_earnings_calendar: "Checking earnings calendar",
  get_team_context: "Reading team notes",
  get_peer_moves: "Checking peer moves",
};

/** One line per turn summarising the research; expands to the individual lookups and any interim notes. */
function ActivityRow({ parts, live }: { parts: Part[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const { lookups, sources, failed, current } = summarizeActivity(parts);
  const running = live && (current !== null || lookups === 0);
  const label = running
    ? current
      ? `${TOOL_PROGRESS[current] ?? current}…`
      : "Working…"
    : `Researched · ${lookups} lookup${lookups === 1 ? "" : "s"} · ${sources} source${sources === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`;

  return (
    <div className="rounded-md border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-muted-foreground hover:text-foreground"
      >
        {running ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <Wrench className="size-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t px-2.5 py-2">
          {parts.map((p, i) =>
            isToolPart(p) ? (
              <ToolCard key={p.toolCallId ?? i} part={p} />
            ) : p.type === "text" && p.text.trim() ? (
              <p key={i} className="whitespace-pre-wrap px-0.5 italic text-muted-foreground">
                {p.text}
              </p>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function ToolCard({ part }: { part: ToolPart }) {
  const name = toolName(part);
  const label = TOOL_LABELS[name] ?? name;
  const input =
    part.input && typeof part.input === "object"
      ? Object.entries(part.input as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(",") : String(v)}`)
          .join(" · ")
      : "";
  const done = toolDone(part);
  const errored = toolFailed(part);
  const n = part.output?.sources?.length ?? 0;
  return (
    <div className={cn("flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs", errored ? "border-destructive/30 text-destructive" : "text-muted-foreground")}>
      {done ? <Wrench className="size-3.5 shrink-0" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
      <span className="font-medium text-foreground">{label}</span>
      {input && <span className="truncate">{input}</span>}
      {errored && <span className="truncate">· {part.output?.error ?? part.errorText ?? "error"}</span>}
      {done && !errored && n > 0 && <span className="ml-auto shrink-0">{n} source{n === 1 ? "" : "s"}</span>}
    </div>
  );
}

function Prose({ text, sources }: { text: string; sources: Map<string, Source> }) {
  // Turn [src:ID] tokens into links the markdown renderer will hand to our chip component.
  // Accepts [src:id], [src: id], and [src: id1, id2].
  const prepared = text.replace(/\[src:\s*([A-Za-z0-9_\-]+(?:\s*,\s*[A-Za-z0-9_\-]+)*)\]/g, (_, ids: string) =>
    ids
      .split(/\s*,\s*/)
      .map((id) => `[${id}](src:${id})`)
      .join(""),
  );
  return (
    <div className="prose-sm max-w-none text-sm leading-relaxed [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_table]:my-2 [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("src:")) {
              const id = href.slice(4);
              const s = sources.get(id);
              return <Chip source={s} id={id} />;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {children}
              </a>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

function Chip({ source, id }: { source?: Source; id: string }) {
  if (!source) {
    return (
      <span className="mx-0.5 inline-flex items-center rounded border border-destructive/40 bg-destructive/5 px-1 align-baseline text-[10px] font-medium text-destructive" title={`Citation ${id} was not returned by any tool`}>
        unverified
      </span>
    );
  }
  const domain = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      return source.publisher;
    }
  })();
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={`${source.title}${source.publishedAt ? ` · ${source.publishedAt.slice(0, 10)}` : ""}`}
      className="mx-0.5 inline-flex max-w-48 items-center gap-1 rounded border bg-muted/60 px-1 align-baseline text-[10px] font-medium text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
    >
      <span className="truncate">{domain}</span>
      <ExternalLink className="size-2.5 shrink-0" />
    </a>
  );
}
