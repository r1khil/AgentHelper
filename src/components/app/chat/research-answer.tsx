"use client";

import { Children, createContext, isValidElement, useContext, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tooltip } from "@base-ui/react/tooltip";
import type { Source } from "@/lib/providers/types";
import { isFigureCell, remarkCitations, remarkNumericColumns } from "@/lib/agent/citation-markdown";
import { resolveCitedId } from "@/lib/agent/citations";
import { externalUrl, resolveSource, sourceType } from "@/lib/agent/source-resolution";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SourceViewer } from "./source-viewer";

/**
 * Board mode: citations talk to a sources panel rendered elsewhere instead of navigating.
 * `openIds` are the source cards currently expanded; `highlight` is the card under the pointer.
 */
export type CitationLinks = {
  onCite: (id: string) => void;
  onHover?: (id: string | null) => void;
  openIds?: ReadonlySet<string>;
  highlight?: string | null;
  /** Citations in an inactive answer read as quiet footnotes until that answer is selected. */
  dim?: boolean;
  /** The element id of a source's card, so a citation is a real link to it. */
  anchor?: (id: string) => string;
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

/** Hoot's citation: a superscript number, underlined, on the page's `cite` style. Amber when the source is unavailable. */
const CITE = "cite focus-visible:outline-2 focus-visible:outline-offset-2";

export function Citation({ id: cited, full = false }: { id: string; full?: boolean }) {
  const { sources, numbers, open, links } = useContext(SourceContext);
  // Answers saved (or still streaming) with a mistyped id still point at the one source they meant.
  const id = resolveCitedId(cited, sources) ?? cited;
  const source = sources.get(id);
  const target = resolveSource(source);
  const title = source?.title?.trim() || "Untitled source";
  const label = numbers.has(id) ? `[${numbers.get(id)}]` : "[?]";
  const unavailable = target.kind === "unavailable";
  if (links && !full) return <LinkedCitation id={id} n={numbers.get(id)} title={title} source={source} unavailable={unavailable} links={links} />;
  const className = full ? "block w-full rounded-md px-2 py-1.5 text-left text-caption hover:bg-muted" : cn(CITE, unavailable ? "text-caution-foreground" : "text-foreground hover:text-ink-2");
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
        className={cn(className, !full && "cursor-pointer bg-transparent")}
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
            {unavailable && <p className="mt-2 text-caution-foreground">Source unavailable: {target.reason}</p>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** A superscript citation that selects a source card (a link to it when the answer knows where the card is). Hover previews the source. */
function LinkedCitation({ id, n, title, source, unavailable, links }: { id: string; n?: number; title: string; source?: Source; unavailable: boolean; links: CitationLinks }) {
  const isOpen = links.openIds?.has(id) ?? false;
  const hot = links.highlight === id;
  const className = cn(CITE, unavailable ? "text-caution-foreground" : "text-foreground", (isOpen || hot) && "[text-decoration-thickness:2px]", links.dim && !isOpen && !hot && "opacity-60");
  const label = `[${n ?? "?"}] ${unavailable ? "Source unavailable" : title}`;
  const handlers = {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (links.anchor) e.preventDefault();
      links.onCite(id);
    },
    onMouseEnter: () => links.onHover?.(id),
    onMouseLeave: () => links.onHover?.(null),
  };
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          links.anchor ? (
            <a href={`#${links.anchor(id)}`} className={className} aria-label={label} {...handlers}>
              {n ?? "?"}
            </a>
          ) : (
            <button type="button" className={cn(className, "cursor-pointer bg-transparent")} aria-label={label} aria-pressed={isOpen} {...handlers}>
              {n ?? "?"}
            </button>
          )
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
            {unavailable && <p className="mt-2 text-caution-foreground">Source unavailable</p>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** The words in a table cell. */
function plain(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? plain(c.props.children) : ""))
    .join("");
}

/** Accounting format carries the colour: (6.4) is down, +8.8 up. Anything that is not a figure stays ink. */
function cellTone(text: string) {
  const t = text.trim();
  if (!isFigureCell(t)) return undefined;
  return t.startsWith("(") ? "text-down" : t.startsWith("+") ? "text-up" : undefined;
}

/**
 * Hoot's prose, anywhere in the app: serif, with his citations as superscripts and his tables as hairline tables (12px
 * grey column labels, 34px rows, figures right-aligned and coloured up and down). Markdown's URL protections stay enabled.
 */
export function ResearchAnswer({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "hoot-prose max-w-none [&_b]:font-semibold [&_h1]:mt-4 [&_h1]:mb-1 [&_h1]:text-title [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-emph [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-0 [&_p+p]:mt-3.5 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitations, remarkNumericColumns]}
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
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse font-sans text-body">{children}</table>
            </div>
          ),
          th: ({ children, style }) => (
            <th style={style} className="h-8 border-b px-2 text-left align-bottom text-caption font-normal whitespace-nowrap text-muted-foreground first:pl-0 last:pr-0">
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td style={style} className={cn("h-[34px] border-b border-row px-2 py-1 align-middle first:pl-0 last:pr-0", cellTone(plain(children)))}>
              {children}
            </td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
