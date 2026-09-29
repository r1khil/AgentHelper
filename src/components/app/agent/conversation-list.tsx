"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { chatWhen } from "@/lib/agent/board";
import { cn } from "@/lib/utils";

/** One conversation in the Research list: a holding board's chat (with its ticker) or a general one. */
export type SidebarChat = {
  id: string;
  href: string;
  title: string;
  authorName: string | null;
  questions: number;
  updatedAt: string;
  running: boolean;
  /** Holding chats only. */
  ticker?: string;
  holdingId?: string;
};

export type ResearchSidebarData = { boards: SidebarChat[]; general: SidebarChat[] };

/** Chats listed before a search is typed; a search looks through every chat the page loaded. */
const SHOWN = 8;

/**
 * "Recent chats": holding-board and general conversations together, newest first, with a search box. A row is the
 * chat's title over who asked and when ("Answering…" in amber while Hoot is still working).
 */
export function RecentChats({ data }: { data: ResearchSidebarData }) {
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  const all = useMemo(() => [...data.boards, ...data.general].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data]);
  const shown = f ? all.filter((c) => c.title.toLowerCase().includes(f) || (c.ticker?.toLowerCase().includes(f) ?? false) || (c.authorName?.toLowerCase().includes(f) ?? false)) : all.slice(0, SHOWN);
  return (
    <section aria-labelledby="recent-chats" data-tour="research-list">
      <div className="flex items-center gap-2.5 border-b pb-1.5">
        <h2 id="recent-chats" className="flex-1 text-body font-bold">
          Recent chats
        </h2>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <Search className="size-[13px]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-[120px] bg-transparent text-caption text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="py-3 text-body text-muted-foreground">{f ? `No chats match “${q.trim()}”.` : "No chats yet. Ask Hoot a question, or open a holding's research, to start one."}</p>
      ) : (
        shown.map((c) => (
          <Link key={c.id} href={c.href} className="flex flex-col gap-0.5 border-b border-row py-[9px] no-underline hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
            <span className="truncate text-body font-medium">
              {c.ticker && <span className="mr-1.5 font-semibold">{c.ticker}</span>}
              {c.title === "New chat" ? "New conversation" : c.title}
            </span>
            <span className={cn("truncate text-caption", c.running ? "text-caution-foreground" : "text-muted-foreground")}>
              {c.running ? "Answering…" : `${c.authorName ?? "Someone"} · ${chatWhen(c.updatedAt)}`}
            </span>
          </Link>
        ))
      )}
    </section>
  );
}
