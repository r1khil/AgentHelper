"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { relativeTime } from "@/lib/format";

export type ConversationRow = {
  id: string;
  title: string;
  authorName: string | null;
  questions: number;
  updatedAt: string;
  running: boolean;
};

const FIRST = 5;

/** General Hoot conversations (asked from attribution, backtesting, Today…), so they can be found again. */
export function ConversationList({ rows }: { rows: ConversationRow[] }) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold">Conversations</h2>
      <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {shown.map((c) => (
          <li key={c.id}>
            <Link href={`/hoot/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
              {c.running ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {c.authorName ?? "Someone"} · {c.questions} question{c.questions === 1 ? "" : "s"}
              </span>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{relativeTime(c.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > FIRST && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}
