"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { chatWhen } from "@/lib/agent/board";
import { cn } from "@/lib/utils";
import { HoldingLogo } from "@/components/app/holding-logo";

/** One thread in the list: a holding's (with its ticker) or a general one (with where it's filed). */
export type ThreadRow = {
  id: string;
  title: string;
  /** Holding threads only. */
  ticker: string | null;
  /** "Whole fund" or the team a general thread is filed under. */
  where: string;
  authorName: string | null;
  questions: number;
  updatedAt: string;
  running: boolean;
};

/**
 * Every thread the member can open, newest first, with a filter over the title, the ticker, where it's filed and who
 * started it. A row is the thread's title (a holding's logo and ticker ahead of it) over who asked and how much, with
 * when on the right ("Answering" in amber while Hoot is still working).
 */
export function ThreadList({ threads }: { threads: ThreadRow[] }) {
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  const shown = useMemo(
    () => (f ? threads.filter((t) => [t.title, t.ticker, t.where, t.authorName].some((v) => v?.toLowerCase().includes(f))) : threads),
    [threads, f],
  );
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col pt-2">
      <label className="flex h-9 items-center gap-2 border-b border-border-strong text-muted-foreground focus-within:text-foreground">
        <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
        <span className="sr-only">Find a thread</span>
        <input type="search" placeholder="Find a thread" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      {shown.length === 0 ? (
        <p className="py-4 text-body text-muted-foreground">{f ? `No threads match “${q.trim()}”.` : "No threads yet. Ask Hoot a question on Home to start one."}</p>
      ) : (
        <ul aria-label="Threads">
          {shown.map((t) => (
            <li key={t.id}>
              <Link
                href={`/hoot/${t.id}`}
                className="flex items-center gap-3 border-b border-row py-2.5 no-underline hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              >
                {t.ticker ? <HoldingLogo ticker={t.ticker} size={20} /> : <span aria-hidden className="size-5 shrink-0" />}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body font-medium">
                    {t.ticker && <span className="mr-1.5 font-semibold">{t.ticker}</span>}
                    {t.title === "New chat" ? "New conversation" : t.title}
                  </span>
                  <span className="truncate text-caption text-muted-foreground">
                    {[t.ticker ? null : t.where, t.authorName ?? "Someone", `${t.questions} question${t.questions === 1 ? "" : "s"}`].filter(Boolean).join(", ")}
                  </span>
                </span>
                <span suppressHydrationWarning className={cn("shrink-0 text-caption", t.running ? "font-semibold text-caution-foreground" : "text-muted-foreground")}>
                  {t.running ? "Answering" : chatWhen(t.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
