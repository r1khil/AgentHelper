"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemoryEntry } from "@/lib/agent/memory/prompt";
import { dateOf, daysBetween, isStaleFact } from "@/lib/agent/memory/prompt";
import { resolveSource } from "@/lib/agent/source-resolution";
import { deleteMemory } from "@/lib/actions/memory";

/** Evidence older than this gets a warning tint on its age chip. */
const OLD_EVIDENCE_DAYS = 90;

/** Latest research-log suggestions for the empty state, else the static defaults. */
export function suggestionsFor(ticker: string, memories: MemoryEntry[], fallback: (t: string) => string[]) {
  const latest = memories.find((m) => m.kind === "log" && m.meta?.nextQuestions?.length);
  const qs = latest?.meta?.nextQuestions?.filter((q) => q.trim().length > 10).slice(0, 3) ?? [];
  return qs.length ? qs : fallback(ticker);
}

function AgeChip({ m, now }: { m: MemoryEntry; now: Date }) {
  if (!m.evidenceAt) return <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">noted {dateOf(m.createdAt)}</span>;
  const days = daysBetween(m.evidenceAt, now);
  const stale = isStaleFact(m, now);
  return (
    <span
      className={cn("rounded px-1 text-[10px]", stale ? "bg-destructive/10 text-destructive" : days > OLD_EVIDENCE_DAYS ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground")}
      title={`Evidence dated ${dateOf(m.evidenceAt)}${m.verifiedAt ? `, confirmed again ${dateOf(m.verifiedAt)}` : ""}`}
    >
      evidence {days} day{days === 1 ? "" : "s"} old{m.verifiedAt ? " · verified" : ""}
    </span>
  );
}

function SourceChips({ sources }: { sources: MemoryEntry["sources"] }) {
  if (!sources.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {sources.slice(0, 4).map((s) => {
        const t = resolveSource(s);
        const label = (s.publisher || s.title || s.id).slice(0, 28);
        return t.kind === "external" ? (
          <a key={s.id} href={t.href} target="_blank" rel="noopener noreferrer" title={s.title} className="rounded border px-1 text-[10px] text-muted-foreground hover:text-foreground">
            {label}
          </a>
        ) : (
          <span key={s.id} title={s.title} className="rounded border px-1 text-[10px] text-muted-foreground">
            {label}
          </span>
        );
      })}
      {sources.length > 4 && <span className="text-[10px] text-muted-foreground">+{sources.length - 4}</span>}
    </span>
  );
}

function Remove({ id }: { id: string }) {
  return (
    <form
      action={deleteMemory}
      className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      onSubmit={(e) => {
        if (!confirm("Remove this entry from the research log?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label="Remove entry" className="rounded p-0.5 text-muted-foreground hover:text-destructive">
        <Trash2 className="size-3" />
      </button>
    </form>
  );
}

/**
 * What the agent learned about this holding in earlier chats: one line per answered question, then the
 * facts and tool lessons it kept, each labeled with the age of its evidence. Compact and collapsible so it
 * sits above the source cards without pushing them off screen.
 */
export function ResearchLogCard({ entries, canManage, defaultOpen }: { entries: MemoryEntry[]; canManage: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const now = new Date();
  const live = entries.filter((m) => !(m.expiresAt && new Date(m.expiresAt) < now));
  const logs = live.filter((m) => m.kind === "log").slice(0, 6);
  const facts = live.filter((m) => m.kind !== "log").slice(0, 8);
  if (live.length === 0) return null;
  return (
    <div className="mx-6 mt-4 rounded-xl bg-card ring-1 ring-foreground/10">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <BookOpen className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Research log</span>
        <span className="text-xs text-muted-foreground">
          {logs.length} question{logs.length === 1 ? "" : "s"} · {facts.length} note{facts.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="max-h-[40vh] overflow-auto border-t px-4 pt-3 pb-3.5 text-[12.8px] leading-[18px]">
          {logs.length > 0 && (
            <ul className="space-y-2">
              {logs.map((m) => (
                <li key={m.id} className="group flex gap-2">
                  <span className="tnum shrink-0 text-[11px] text-muted-foreground">{dateOf(m.createdAt)}</span>
                  <div className="min-w-0 flex-1">
                    {m.meta?.question && <div className="truncate text-[11px] text-muted-foreground" title={m.meta.question}>{m.meta.question}</div>}
                    <div>{m.body}</div>
                  </div>
                  {canManage && <Remove id={m.id} />}
                </li>
              ))}
            </ul>
          )}
          {facts.length > 0 && (
            <>
              <div className={cn("text-[11px] font-semibold tracking-wide text-muted-foreground uppercase", logs.length > 0 && "mt-3.5")}>Known facts and lessons</div>
              <ul className="mt-1.5 space-y-1.5">
                {facts.map((m) => (
                  <li key={m.id} className="group flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {m.kind === "lesson" && <span className="mr-1 rounded bg-primary/10 px-1 text-[10px] text-foreground">lesson</span>}
                      <span>{m.body}</span>
                      <SourceChips sources={m.sources} />
                      <span className="ml-1 inline-block align-middle">
                        <AgeChip m={m} now={now} />
                      </span>
                    </div>
                    {canManage && <Remove id={m.id} />}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-3 text-[11px] text-muted-foreground">Written by the agent after each answer. Evidence dates say how old the sources behind a fact are; the agent re-checks old ones before quoting a number.</div>
        </div>
      )}
    </div>
  );
}
