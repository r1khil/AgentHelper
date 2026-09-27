"use client";

import { citationParts } from "@/lib/today";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Brief, BriefSource } from "./types";

const CHIP = "mx-0.5 inline-block rounded-full bg-hoot px-1.5 py-px align-[1px] font-mono text-[10.5px] leading-normal font-medium text-hoot-foreground";

/** Brief text with Hoot's [n] citations as pink numbered chips, linked to the source when it has a URL. */
export function Cited({ text, sources }: { text: string; sources: BriefSource[] }) {
  return (
    <>
      {citationParts(text).map((part, i) => {
        if (typeof part === "string") return <span key={i}>{part}</span>;
        const s = sources[part - 1];
        return s?.url ? (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" title={`${s.title} · ${s.publisher}`} className={`${CHIP} hover:underline`}>
            {part}
          </a>
        ) : (
          <span key={i} title={s ? `${s.title} · ${s.publisher}` : undefined} className={CHIP}>
            {part}
          </span>
        );
      })}
    </>
  );
}

/** "Read the full brief · 4 sources →": every paragraph and the numbered sources. */
export function BriefDialog({ brief, written }: { brief: Brief; written: string | null }) {
  const n = brief.sources.length;
  return (
    <Dialog>
      <DialogTrigger className="mt-2 text-[13px] font-semibold hover:underline focus-visible:underline focus-visible:outline-none">
        Read the full brief{n ? ` · ${n} ${n === 1 ? "source" : "sources"}` : ""} →
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-[14px] p-6 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold">Hoot&rsquo;s evening brief</DialogTitle>
          {written && <DialogDescription>{written}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 text-[14.5px] leading-[1.6]">
          {brief.paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              <Cited text={p} sources={brief.sources} />
            </p>
          ))}
        </div>
        {brief.stale && <p className="text-xs text-muted-foreground">Hoot wrote this from the evening figures, which have since been revised. The Last session figures on Today are current.</p>}
        {n > 0 && (
          <ol className="space-y-1.5 border-t border-row pt-3 text-[13px] text-muted-foreground">
            {brief.sources.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className={`${CHIP} mx-0 shrink-0 self-start`}>{i + 1}</span>
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
