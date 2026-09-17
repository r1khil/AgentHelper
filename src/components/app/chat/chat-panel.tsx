"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, ExternalLink, Loader2, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { collectSources } from "@/lib/agent/citations";
import type { Source } from "@/lib/providers/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  "What moved {T} today versus the S&P 500, and what filings or news are in the window?",
  "Summarize the last 10-Q for {T}: revenue, margins, and guidance, with sources.",
  "When does {T} report next? Pull the prior quarter's release and the key questions the team noted.",
  "Explain how to read the segment disclosure in {T}'s latest 10-K.",
];

export function ChatPanel({ chatId, initialMessages, tickers, configured, modelId }: { chatId: string; initialMessages: UIMessage[]; tickers: string[]; configured: boolean; modelId: string }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({ body: { chatId: id, message: messages[messages.length - 1] } }),
      }),
    [],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ id: chatId, messages: initialMessages, transport });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const sources = useMemo(() => collectSources(messages), [messages]);

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  const t = tickers[0] ?? "NVDA";

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
            <Message key={m.id} message={m} sources={sources} />
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </div>
          )}
          {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error.message}</div>}
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
              placeholder={configured ? "Ask about a holding, a filing, a move…" : "Agent is not configured: add OPENROUTER_API_KEY"}
              disabled={!configured}
              rows={2}
              className="min-h-10 resize-none"
            />
            {busy ? (
              <Button type="button" variant="outline" size="icon" onClick={() => stop()} aria-label="Stop">
                <span className="size-2.5 rounded-sm bg-foreground" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim() || !configured} aria-label="Send">
                <ArrowUp />
              </Button>
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">Model: {modelId}. Every fact should carry a source chip; unverified chips mean the model cited something it never retrieved.</div>
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

function Message({ message, sources }: { message: UIMessage; sources: Map<string, Source> }) {
  const isUser = message.role === "user";
  const meta = (message.metadata ?? {}) as { uncited?: number };
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-2", isUser ? "rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "w-full")}>
        {message.parts.map((p, i) => {
          if (p.type === "text") return isUser ? <p key={i} className="whitespace-pre-wrap">{p.text}</p> : <Prose key={i} text={p.text} sources={sources} />;
          if (typeof p.type === "string" && p.type.startsWith("tool-")) return <ToolCard key={i} part={p as ToolPart} />;
          return null;
        })}
        {!isUser && meta.uncited !== undefined && meta.uncited > 0 && (
          <div className="text-[11px] text-warning-foreground">
            {meta.uncited} sentence{meta.uncited === 1 ? "" : "s"} with numbers carry no citation (heuristic). Check them against the sources.
          </div>
        )}
      </div>
    </div>
  );
}

type ToolPart = { type: string; toolCallId: string; state: string; input?: unknown; output?: { error?: string; sources?: Source[] }; errorText?: string };

const TOOL_LABELS: Record<string, string> = {
  get_quote: "Quote",
  get_price_history: "Price history",
  get_relative_moves: "Relative moves vs S&P",
  get_filings: "SEC filings",
  read_filing: "Read filing",
  list_filing_documents: "Filing documents",
  search_financial_concepts: "Search XBRL concepts",
  get_financials: "Financials",
  get_news: "News",
  get_earnings_calendar: "Earnings calendar",
  get_team_context: "Team context",
  get_peer_moves: "Peer moves",
};

function ToolCard({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "");
  const label = TOOL_LABELS[name] ?? name;
  const input = part.input && typeof part.input === "object" ? Object.entries(part.input as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(",") : String(v)}`).join(" · ") : "";
  const done = part.state === "output-available";
  const errored = part.state === "output-error" || part.output?.error;
  const n = part.output?.sources?.length ?? 0;
  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs", errored ? "border-destructive/30 text-destructive" : "text-muted-foreground")}>
      {done || errored ? <Wrench className="size-3.5 shrink-0" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
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
