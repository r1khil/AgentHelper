"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { startHootChat } from "@/lib/actions/chats";
import { Button } from "@/components/ui/button";

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

/** "now", "12m ago", "3h ago", then the day ("Sep 25"). */
export function listWhen(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime();
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmtDay(new Date(t), new Date(now));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The left column of Research › Conversations: search, New, then holding-board chats and general chats.
 * `onSelect` lets the research board switch between its own chats without a navigation; return true when handled.
 */
export function ConversationSidebar({
  data,
  selectedId,
  teamSlug,
  configured = true,
  onSelect,
}: {
  data: ResearchSidebarData;
  selectedId?: string | null;
  /** Where a new general chat is filed (null: the member's own team). */
  teamSlug: string | null;
  configured?: boolean;
  onSelect?: (chat: SidebarChat) => boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [starting, setStarting] = useState(false);
  const f = q.trim().toLowerCase();
  const match = (c: SidebarChat) => !f || c.title.toLowerCase().includes(f) || (c.ticker?.toLowerCase().includes(f) ?? false) || (c.authorName?.toLowerCase().includes(f) ?? false);
  const boards = data.boards.filter(match);
  const general = data.general.filter(match);

  /** A new general conversation, opened the same way the ask box opens one (the question is typed there). */
  const startNew = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await startHootChat({ teamSlug, ticker: null });
      if ("error" in res) {
        toast(res.error);
        return;
      }
      router.push(res.href);
    } catch {
      toast("Couldn't open a chat just now. Try again in a moment.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 gap-2">
        <label className="flex h-[34px] min-w-0 flex-1 items-center gap-1.5 rounded-full bg-card px-3 text-muted-foreground shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--ring)]">
          <Search className="size-3.5 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Button type="button" size="lg" className="h-[34px] gap-1 px-3.5" onClick={() => void startNew()} disabled={starting || !configured}>
          {starting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          New
        </Button>
      </div>
      <nav aria-label="Chats" className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pt-px pb-1">
        {boards.length > 0 && <Group label="By holding" rows={boards} selectedId={selectedId} onSelect={onSelect} />}
        {general.length > 0 && <Group label="General" rows={general} selectedId={selectedId} onSelect={onSelect} />}
        {boards.length === 0 && general.length === 0 && (
          <p className="px-2.5 text-body leading-relaxed text-muted-foreground">
            {f ? `No chats match “${q.trim()}”.` : "No chats yet. Ask Hoot a question, or open a holding's research, to start one."}
          </p>
        )}
      </nav>
    </>
  );
}

function Group({ label, rows, selectedId, onSelect }: { label: string; rows: SidebarChat[]; selectedId?: string | null; onSelect?: (c: SidebarChat) => boolean }) {
  return (
    <div>
      <div className="px-2.5 pb-1.5 font-mono text-caption tracking-[0.06em] text-muted-foreground uppercase">{label}</div>
      <ul className="flex flex-col">
        {rows.map((c) => {
          const selected = c.id === selectedId;
          return (
            <li key={c.id}>
              <Link
                href={c.href}
                aria-current={selected ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  if (onSelect?.(c)) e.preventDefault();
                }}
                className={cn(
                  "block rounded-[10px] px-2.5 py-2 transition-colors",
                  selected ? "bg-card shadow-[0_0_0_1px_var(--border)]" : "hover:bg-band",
                )}
              >
                <div className="flex items-baseline gap-1.5">
                  {c.ticker && <span className="font-mono text-body font-semibold">{c.ticker}</span>}
                  <span className="min-w-0 flex-1 truncate text-body">{c.title === "New chat" ? "New conversation" : c.title}</span>
                </div>
                <div className="mt-px flex items-center gap-1 text-caption text-muted-foreground">
                  {c.running && <Loader2 className="size-3 shrink-0 animate-spin" aria-label="Answering" />}
                  <span className="truncate">
                    {c.authorName ?? "Someone"} · {plural(c.questions, "question")} · {listWhen(c.updatedAt)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
