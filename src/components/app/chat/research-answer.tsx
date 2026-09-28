"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tooltip } from "@base-ui/react/tooltip";
import type { Source } from "@/lib/providers/types";
import { remarkCitations } from "@/lib/agent/citation-markdown";
import { resolveCitedId } from "@/lib/agent/citations";
import { externalUrl, resolveSource, sourceType } from "@/lib/agent/source-resolution";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
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

/** Open a source in the shared viewer (documents); for use beside the answers, e.g. a sources list. */
export function useSourceViewer() {
  return useContext(SourceContext).open;
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
    ? "block w-full rounded-md px-2 py-1.5 text-left text-caption hover:bg-muted"
    : `${CHIP} ${unavailable ? "bg-destructive/10 text-destructive" : "bg-hoot text-hoot-foreground hover:ring-1 hover:ring-hoot-foreground/50"}`;
  const content = full ? (
    <>
      <span className="line-clamp-2 font-medium">
        {label} {title}
      </span>
      <span className="mt-0.5 block text-muted-foreground">
        {source?.publisher || "Publisher unavailable"}
        {source?.publishedAt ? ` · ${fmtDate(source.publishedAt) || source.publishedAt.slice(0, 10)}` : ""}
      </span>
      {unavailable && <span>Source unavailable</span>}
    </>
  ) : (
    (numbers.get(id) ?? "?")
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
          <Tooltip.Popup className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-body text-popover-foreground shadow-lg">
            <div className="font-semibold">{title}</div>
            <div className="mt-1 text-muted-foreground">
              {source ? sourceType(source) : "Unknown source type"} · {fmtDate(source?.publishedAt) || "Date unavailable"}
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
    CHIP,
    "transition-[color,background-color,box-shadow,opacity]",
    unavailable
      ? "bg-destructive/10 text-destructive"
      : isOpen
        ? "bg-hoot-foreground text-hoot"
        : hot
          ? "bg-hoot text-hoot-foreground ring-1 ring-hoot-foreground/60"
          : "bg-hoot text-hoot-foreground",
    links.dim && !isOpen && !hot ? "opacity-60" : "",
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
          <Tooltip.Popup className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-body text-popover-foreground shadow-lg">
            <div className="font-semibold">{title}</div>
            <div className="mt-1 text-muted-foreground">
              {source ? sourceType(source) : "Unknown source type"} · {fmtDate(source?.publishedAt) || "Date unavailable"}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap">{source?.excerpt?.slice(0, 360) || "Supporting excerpt unavailable. Open the source card to review it."}</p>
            {unavailable && <p className="mt-2 text-destructive">Source unavailable</p>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Hoot's pink numbered citation chip: tiny, round, mono. */
const CHIP = "mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 align-[1px] font-mono text-caption leading-none font-medium not-italic no-underline focus-visible:outline-2";

/** Reusable for research prose anywhere in the app. Markdown's URL protections stay enabled. */
export function ResearchAnswer({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("prose-sm max-w-none text-body leading-relaxed [&_h1]:mt-3 [&_h1]:text-emph [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-body [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-body [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_table]:my-2 [&_table]:text-body [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5", className)}>
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
