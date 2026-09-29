"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemoryEntry } from "@/lib/agent/memory/prompt";
import { dateOf, daysBetween, isStaleFact } from "@/lib/agent/memory/prompt";
import { resolveSource } from "@/lib/agent/source-resolution";
import { deleteMemory } from "@/lib/actions/memory";
import { fmtDayMonth } from "@/lib/format";
import { SideHeading } from "@/components/app/chat/thread-parts";

/** Evidence older than this gets an amber note. */
const OLD_EVIDENCE_DAYS = 90;
/** Notes shown before "Show all". */
const SHOWN = 4;

/** Latest research-log suggestions for the empty state, else the static defaults. */
export function suggestionsFor(ticker: string, memories: MemoryEntry[], fallback: (t: string) => string[]) {
  const latest = memories.find((m) => m.kind === "log" && m.meta?.nextQuestions?.length);
  const qs = latest?.meta?.nextQuestions?.filter((q) => q.trim().length > 10).slice(0, 3) ?? [];
  return qs.length ? qs : fallback(ticker);
}

/** How old the evidence behind a note is, in words: grey when recent, amber when old or stale. */
function Age({ m, now }: { m: MemoryEntry; now: Date }) {
  if (!m.evidenceAt) return <span className="text-muted-foreground">noted {fmtDayMonth(m.createdAt)}</span>;
  const days = daysBetween(m.evidenceAt, now);
  const stale = isStaleFact(m, now);
  return (
    <span className={cn(stale || days > OLD_EVIDENCE_DAYS ? "text-caution-foreground" : "text-muted-foreground")} title={`Evidence dated ${dateOf(m.evidenceAt)}${m.verifiedAt ? `, confirmed again ${dateOf(m.verifiedAt)}` : ""}`}>
      {stale ? "stale, " : ""}evidence {days} day{days === 1 ? "" : "s"} old{m.verifiedAt ? ", verified" : ""}
    </span>
  );
}

function SourceLinks({ sources }: { sources: MemoryEntry["sources"] }) {
  if (!sources.length) return null;
  return (
    <>
      {sources.slice(0, 3).map((s) => {
        const t = resolveSource(s);
        const label = (s.publisher || s.title || s.id).slice(0, 28);
        return t.kind === "external" ? (
          <a key={s.id} href={t.href} target="_blank" rel="noopener noreferrer" title={s.title} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {label}
          </a>
        ) : (
          <span key={s.id} title={s.title} className="text-muted-foreground">
            {label}
          </span>
        );
      })}
      {sources.length > 3 && <span className="text-muted-foreground">+{sources.length - 3}</span>}
    </>
  );
}

function Remove({ id, what }: { id: string; what: string }) {
  return (
    <form
      action={deleteMemory}
      className="shrink-0"
      onSubmit={(e) => {
        if (!confirm("Remove this entry from the research log?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label={`Remove: ${what}`} className="grid size-5 place-items-center rounded text-muted-foreground hover:text-down focus-visible:outline-2 focus-visible:outline-ring">
        <X className="size-3" aria-hidden />
      </button>
    </form>
  );
}

/**
 * "What Hoot remembers about THC": the facts and tool lessons the agent kept from earlier chats, each with the age of its
 * evidence, and under them the research log (one line per answered question). "Edit memories" lets leads, execs and
 * admins remove entries (an analyst can remove those from their own chats).
 */
export function ResearchMemory({ ticker, entries, canManage }: { ticker: string; entries: MemoryEntry[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(false);
  const [log, setLog] = useState(false);
  const now = new Date();
  const live = entries.filter((m) => !(m.expiresAt && new Date(m.expiresAt) < now));
  const facts = live.filter((m) => m.kind !== "log");
  const logs = live.filter((m) => m.kind === "log");
  const shownFacts = all ? facts : facts.slice(0, SHOWN);

  return (
    <section aria-label={`What Hoot remembers about ${ticker}`}>
      <SideHeading>What Hoot remembers about {ticker}</SideHeading>
      {live.length === 0 ? (
        <p className="mt-1 text-caption text-muted-foreground">Nothing yet. After each answer, Hoot notes what he learned about {ticker} here.</p>
      ) : (
        <>
          {shownFacts.map((m) => (
            <div key={m.id} className="flex items-start gap-2 border-b border-row py-[7px] text-caption text-ink-3">
              <div className="min-w-0 flex-1">
                {m.kind === "lesson" && <span className="mr-1 font-semibold text-foreground">Lesson</span>}
                {m.body}
                <span className="mt-0.5 flex flex-wrap gap-x-1.5">
                  <Age m={m} now={now} />
                  <SourceLinks sources={m.sources} />
                </span>
              </div>
              {editing && canManage && <Remove id={m.id} what={m.body.slice(0, 60)} />}
            </div>
          ))}
          {facts.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 text-caption text-ink-2 hover:text-foreground">
              {all ? "Show fewer" : `Show all ${facts.length}`}
            </button>
          )}
          {logs.length > 0 && (
            <div className="mt-2">
              <button type="button" onClick={() => setLog((v) => !v)} aria-expanded={log} className="text-caption text-ink-2 hover:text-foreground">
                {log ? "Hide" : "Show"} research log · {logs.length} question{logs.length === 1 ? "" : "s"}
              </button>
              {log &&
                logs.slice(0, 6).map((m) => (
                  <div key={m.id} className="flex items-start gap-2 border-b border-row py-[7px] text-caption text-ink-3">
                    <div className="min-w-0 flex-1">
                      {m.meta?.question && <div className="truncate text-muted-foreground" title={m.meta.question}>{m.meta.question}</div>}
                      {m.body}
                      <div className="text-muted-foreground">{fmtDayMonth(m.createdAt)}</div>
                    </div>
                    {editing && canManage && <Remove id={m.id} what={m.body.slice(0, 60)} />}
                  </div>
                ))}
            </div>
          )}
          {canManage && (
            <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing} className="mt-1.5 block text-caption font-semibold text-foreground hover:underline">
              {editing ? "Done editing" : "Edit memories"}
            </button>
          )}
          <p className="mt-2 text-caption text-muted-foreground">Written by Hoot after each answer. He re-checks old evidence before quoting a number.</p>
        </>
      )}
    </section>
  );
}
