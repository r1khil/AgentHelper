"use client";

import { citationParts } from "@/lib/today";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Brief, BriefSource } from "./types";

/** Brief text with Hoot's [n] citations as superscripts, linked to the source when it has a URL. */
export function Cited({ text, sources }: { text: string; sources: BriefSource[] }) {
  return (
    <>
      {citationParts(text).map((part, i) => {
        if (typeof part === "string") return <span key={i}>{part}</span>;
        const s = sources[part - 1];
        return s?.url ? (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" title={`${s.title} · ${s.publisher}`} className="cite text-foreground">
            {part}
          </a>
        ) : (
          <span key={i} title={s ? `${s.title} · ${s.publisher}` : undefined} className="cite text-foreground no-underline">
            {part}
          </span>
        );
      })}
    </>
  );
}

/** "Read the evening brief · 4 sources": every paragraph and the numbered sources. */
export function BriefDialog({ brief, written }: { brief: Brief; written: string | null }) {
  const n = brief.sources.length;
  return (
    <Dialog>
      <DialogTrigger className="mt-2 text-body font-semibold hover:underline focus-visible:underline focus-visible:outline-none">
        Read the evening brief{n ? ` · ${n} ${n === 1 ? "source" : "sources"}` : ""}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-title font-bold">Hoot&rsquo;s evening brief</DialogTitle>
          {written && <DialogDescription>{written}</DialogDescription>}
        </DialogHeader>
        <div className="hoot-prose space-y-3.5">
          {brief.paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              <Cited text={p} sources={brief.sources} />
            </p>
          ))}
        </div>
        {brief.stale && <p className="text-body text-caution-foreground">Hoot wrote this from the evening figures, which have since been revised. The Last session figures on Home are current.</p>}
        {n > 0 && (
          <ol className="space-y-1.5 border-t pt-3 text-body text-muted-foreground">
            {brief.sources.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <b className="w-4 shrink-0 font-semibold text-foreground">{i + 1}</b>
                <span className="min-w-0">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-foreground underline-offset-2 hover:underline">
                      {s.title}
                    </a>
                  ) : (
                    <span className="text-foreground">{s.title}</span>
                  )}{" "}
                  · {s.publisher}
                </span>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
