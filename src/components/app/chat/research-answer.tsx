"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tooltip } from "@base-ui/react/tooltip";
import type { Source } from "@/lib/providers/types";
import { remarkCitations } from "@/lib/agent/citation-markdown";
import { resolveCitedId } from "@/lib/agent/citations";
import { externalUrl, resolveSource, sourceType } from "@/lib/agent/source-resolution";
import { SourceViewer } from "./source-viewer";

/**
 * Board mode: citation chips talk to a sources panel rendered elsewhere instead of navigating.
 * `openIds` are the source cards currently expanded; `highlight` is the card under the pointer.
 */
export type CitationLinks = {
  onCite: (id: string) => void;
  onHover?: (id: string | null) => void;
  openIds?: ReadonlySet<string>;
  highlight?: string | null;
  /** Chips in an inactive answer read as quiet footnotes until that answer is selected. */
  dim?: boolean;
};

const SourceContext = createContext<{ sources: Map<string, Source>; numbers: Map<string, number>; open: (source: Source) => void; links?: CitationLinks }>({
  sources: new Map(),
  numbers: new Map(),
  open: () => {},
});

/**
 * One registry and viewer shared by every answer and the source list.
 * `numbers` overrides the default 1..n order (the board numbers sources per answer).
 */
export function ResearchSources({
  sources,
  chatId,
  numbers,
  links,
  children,
}: {
  sources: Map<string, Source>;
  chatId: string;
  numbers?: Map<string, number>;
  links?: CitationLinks;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Source | null>(null);
  const value = useMemo(
    () => ({ sources, numbers: numbers ?? new Map([...sources.keys()].map((id, i) => [id, i + 1])), open: setSelected, links }),
    [sources, numbers, links],
  );
  return (
    <SourceContext.Provider value={value}>
      <Tooltip.Provider delay={250}>{children}</Tooltip.Provider>
      <SourceViewer source={selected} chatId={chatId} onClose={() => setSelected(null)} />
    </SourceContext.Provider>
  );
}

export function Citation({ id: cited, full = false }: { id: string; full?: boolean }) {
  const { sources, numbers, open, links } = useContext(SourceContext);
  // Answers saved (or still streaming) with a mistyped id still point at the one source they meant.
  const id = resolveCitedId(cited, sources) ?? cited;
  const source = sources.get(id);
  const target = resolveSource(source);
  const title = source?.title?.trim() || "Untitled source";
  const label = numbers.has(id) ? `[${numbers.get(id)}]` : "[?]";
  const unavailable = target.kind === "unavailable";
  if (links && !full) return <ChipCitation id={id} n={numbers.get(id)} title={title} source={source} unavailable={unavailable} links={links} />;
  const className = full
    ? "block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
    : `mx-0.5 inline-flex rounded border px-1.5 align-baseline text-[11px] font-medium not-italic no-underline focus-visible:outline-2 ${unavailable ? "border-destructive/40 text-destructive" : "bg-muted/60 hover:bg-muted"}`;
  const content = full ? (
    <>
      <span className="line-clamp-2 font-medium">
        {label} {title}
      </span>
      <span className="mt-0.5 block text-muted-foreground">
        {source?.publisher || "Publisher unavailable"}
        {source?.publishedAt ? ` · ${source.publishedAt.slice(0, 10)}` : ""}
      </span>
      {unavailable && <span>Source unavailable</span>}
    </>
  ) : (
    label
  );
  const trigger =
    target.kind === "external" ? (
      <a href={target.href} target="_blank" rel="noopener noreferrer" className={className} aria-label={`${label} ${title} (opens in a new tab)`}>
        {content}
      </a>
    ) : (
      <button
        type="button"
        className={className}
        aria-label={`${label} ${unavailable ? "Source unavailable" : title}`}
        onClick={() => open(source ?? { id, title: "Source unavailable", publisher: "", retrievedAt: "" })}
      >
        {content}
      </button>
    );
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={trigger} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6} className="z-[70]">
          <Tooltip.Popup className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
            <div className="font-semibold">{title}</div>
            <div className="mt-1 text-muted-foreground">
              {source ? sourceType(source) : "Unknown source type"} · {source?.publishedAt?.slice(0, 10) || "Date unavailable"}
            </div>
            {source?.location?.section && <div className="mt-1">{source.location.section}</div>}
            {source?.location?.page && <div>Page {source.location.page}</div>}
            <p className="mt-2 whitespace-pre-wrap">{source?.excerpt?.slice(0, 360) || "Supporting excerpt unavailable. Open the document to review the source."}</p>
            {unavailable && <p className="mt-2 text-destructive">Source unavailable: {target.reason}</p>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** A footnote-style chip that selects a source card on the board. Hover previews the source. */
function ChipCitation({ id, n, title, source, unavailable, links }: { id: string; n?: number; title: string; source?: Source; unavailable: boolean; links: CitationLinks }) {
  const isOpen = links.openIds?.has(id) ?? false;
  const hot = links.highlight === id;
  const className = [
    "mx-0.5 inline-flex rounded border px-[5px] align-baseline text-[11px] leading-4 font-medium not-italic no-underline transition-colors focus-visible:outline-2",
    unavailable
      ? "border-destructive/40 text-destructive"
      : isOpen
        ? "border-primary bg-primary text-primary-foreground"
        : hot
          ? "border-foreground bg-background text-foreground"
          : "border-border bg-muted",
    links.dim && !isOpen && !hot ? "opacity-70" : "",
  ].join(" ");
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            className={className}
            aria-label={`[${n ?? "?"}] ${unavailable ? "Source unavailable" : title}`}
            aria-pressed={isOpen}
            onClick={(e) => {
              e.stopPropagation();
              links.onCite(id);
            }}
            onMouseEnter={() => links.onHover?.(id)}
            onMouseLeave={() => links.onHover?.(null)}
          >
            {n ?? "?"}
          </button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6} className="z-[70]">
          <Tooltip.Popup className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
            <div className="font-semibold">{title}</div>
            <div className="mt-1 text-muted-foreground">
              {source ? sourceType(source) : "Unknown source type"} · {source?.publishedAt?.slice(0, 10) || "Date unavailable"}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap">{source?.excerpt?.slice(0, 360) || "Supporting excerpt unavailable. Open the source card to review it."}</p>
            {unavailable && <p className="mt-2 text-destructive">Source unavailable</p>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Reusable for research prose anywhere in the app. Markdown's URL protections stay enabled. */
export function ResearchAnswer({ text }: { text: string }) {
  return (
    <div className="prose-sm max-w-none text-sm leading-relaxed [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_table]:my-2 [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitations]}
        components={{
          cite: ({ node }) => <Citation id={String(node?.properties["data-source-id"] ?? "")} />,
          a: ({ href, children }) => {
            const url = externalUrl(href);
            return url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {children}
              </a>
            ) : (
              <span title="Link unavailable">{children}</span>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
