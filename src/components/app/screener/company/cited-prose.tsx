import type { Citation, CitedSentence } from "@/db/schema";

/**
 * Hoot's cited sentences, in his serif: each sentence followed by its source numbers, each number a link to the filing.
 * A quote the code verified word for word is shown as it appears in the filing.
 */
export function CitedProse({ sentences, citations, className }: { sentences: CitedSentence[]; citations: Citation[]; className?: string }) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  return (
    <p className={className ?? "hoot-prose max-w-[68ch]"}>
      {sentences.map((s, i) => (
        <span key={i}>
          {i > 0 && " "}
          {s.text}
          {s.cites.map((n) => (
            <Cite key={n} n={n} c={byN.get(n)} />
          ))}
          {s.quote && <span className="text-muted-foreground"> &ldquo;{s.quote}&rdquo;</span>}
        </span>
      ))}
    </p>
  );
}

export function Cite({ n, c }: { n: number; c: Citation | undefined }) {
  const chip = "ml-0.5 inline-grid h-[18px] min-w-[18px] -translate-y-px place-items-center rounded-full bg-secondary px-1 align-middle font-sans text-caption leading-none font-semibold text-foreground";
  if (!c) return <span className={chip}>{n}</span>;
  const external = /^https?:/.test(c.url);
  return (
    <a href={c.url} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} title={c.label} aria-label={`Source ${n}: ${c.label}`} className={`${chip} no-underline hover:bg-muted`}>
      {n}
    </a>
  );
}

/** The numbered sources under a piece of Hoot's writing. */
export function SourceList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <ol aria-label="Sources" className="mt-6 flex flex-col gap-1 border-t pt-3 text-caption text-muted-foreground">
      {citations.map((c) => (
        <li key={c.n} className="flex gap-2">
          <span className="w-4 shrink-0 text-right font-semibold text-foreground tabular-nums">{c.n}</span>
          {/^https?:/.test(c.url) ? (
            <a href={c.url} target="_blank" rel="noreferrer" className="truncate hover:text-foreground hover:underline">
              {c.label}
            </a>
          ) : (
            <span className="truncate">{c.label}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
