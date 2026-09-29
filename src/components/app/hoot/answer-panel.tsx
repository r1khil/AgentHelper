"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { CommandHolding } from "@/lib/nav-data";
import { closeAnswerPanel, useAnswerPanel, type AnswerPanelState } from "./answer-panel-store";
import { HootOnPage } from "./presence";
import { ConversationTurns, useConversation } from "@/components/app/chat/conversation";
import type { PinTarget } from "@/components/app/chat/pin-to-board";
import { Composer, HootFace } from "@/components/app/chat/thread-parts";
import { cn } from "@/lib/utils";

/** After an answer, Hoot notes his next questions a few seconds later; look for them this often, this many times. */
const RELATED_EVERY_MS = 5000;
const RELATED_TRIES = 5;

const icon = "grid size-[30px] place-items-center rounded-md text-ink-2 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Hoot's answer panel: a question asked from ⌘J on an ordinary page is answered here, in a 480px panel that slides in
 * from the right over the page (no motion when the reader prefers less). It is the same conversation as the full thread,
 * so "Open as a full thread" carries on where the panel left off. The shell mounts it once.
 */
export function HootAnswerPanel({ holdings }: { holdings: CommandHolding[] }) {
  const panel = useAnswerPanel();
  const pathname = usePathname();
  // Leaving the page it was asked about closes it: its chip would no longer be true.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!panel) {
      opened.current = null;
      return;
    }
    if (opened.current === null) opened.current = pathname;
    else if (opened.current !== pathname) closeAnswerPanel();
  }, [panel, pathname]);
  if (!panel) return null;
  return <Panel key={`${panel.chatId}:${panel.seq}`} panel={panel} holdings={holdings} />;
}

function Panel({ panel, holdings }: { panel: NonNullable<AnswerPanelState>; holdings: CommandHolding[] }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const conv = useConversation({ chatId: panel.chatId, initialMessages: [], initialRunStatus: "idle", transparency: false });
  const related = useRelated(panel.chatId, conv.turns.length > 0 && !conv.busy && !!conv.turns[conv.turns.length - 1]?.answerText, conv.turns.length);
  const targets = useMemo<PinTarget[]>(() => holdings.map((h) => ({ ticker: h.ticker, company: h.company, teamSlug: h.teamSlug, team: h.team })), [holdings]);

  // Follow the answer to the bottom, and put the cursor in the follow-up box once the panel is in.
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [conv.messages, conv.status, conv.catchingUp]);
  const { composerRef } = conv;
  useEffect(() => {
    composerRef.current?.focus({ preventScroll: true });
  }, [composerRef]);

  return (
    <aside
      role="complementary"
      aria-label="Hoot"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) closeAnswerPanel();
      }}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-[480px] max-w-full flex-col border-l bg-background shadow-[-16px_0_40px_rgb(10_10_10/0.08)] transition-transform duration-[220ms] ease-out motion-reduce:transition-none dark:shadow-[-16px_0_40px_rgb(0_0_0/0.5)]",
        shown ? "translate-x-0" : "translate-x-full",
      )}
    >
      <HootOnPage />
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b pr-4 pl-5">
        <HootFace />
        <span className="text-emph font-semibold">Hoot</span>
        <span className="min-w-0 truncate rounded-md bg-secondary px-2 py-[3px] text-caption text-ink-3" title={panel.context}>
          {panel.context}
        </span>
        <span className="flex-1" />
        <Link href={panel.href} aria-label="Open as a full thread" title="Open as a full thread" className={icon}>
          <ArrowUpRight className="size-[15px]" strokeWidth={1.8} aria-hidden />
        </Link>
        <button type="button" onClick={closeAnswerPanel} aria-label="Close Hoot" title="Close" className={icon}>
          <X className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-4">
        <ConversationTurns conv={conv} variant="panel" teamSlug={null} pin={targets.length ? { chatId: panel.chatId, targets, onPinned: closeAnswerPanel } : null} related={related} gap="gap-6" />
        <div ref={bottom} />
      </div>
      <div className="shrink-0 px-4 pt-3">
        <Composer
          variant="compact"
          value={conv.input}
          onChange={conv.setInput}
          onSend={conv.submit}
          onStop={conv.stopWatching}
          streaming={conv.streaming}
          disabled={conv.catchingUp}
          sendDisabled={conv.busy}
          inputRef={composerRef}
          placeholder={conv.catchingUp ? "Waiting for the current answer…" : "Ask a follow-up"}
        />
        <p className="pt-1.5 pb-3.5 text-caption text-muted-foreground">Hoot finds and cites the evidence. The conclusions stay yours.</p>
      </div>
    </aside>
  );
}

/** Hoot's next questions for the chat, once he has noted them (a few seconds after an answer). Empty until then. */
function useRelated(chatId: string, answered: boolean, turns: number): string[] {
  const [found, setFound] = useState<{ chatId: string; turns: number; questions: string[] } | null>(null);
  useEffect(() => {
    if (!answered) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      tries++;
      try {
        const res = await fetch(`/api/chat/${chatId}?related=1`, { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { related?: string[] }) : null;
        if (cancelled) return;
        if (data?.related?.length) return setFound({ chatId, turns, questions: data.related });
      } catch {
        // Offline: no suggestions.
      }
      if (!cancelled && tries < RELATED_TRIES) timer = setTimeout(look, RELATED_EVERY_MS);
    };
    timer = setTimeout(look, RELATED_EVERY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, answered, turns]);
  // Suggestions belong to the answer they followed; a new question clears them.
  return found && found.chatId === chatId && found.turns === turns ? found.questions : [];
}
