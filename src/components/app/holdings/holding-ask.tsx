"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createHoldingChat } from "@/lib/actions/chats";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { pageContextFor } from "@/components/app/hoot/page-context";
import { useHootCommand } from "@/components/app/hoot/use-hoot-command";
import { DictateButton } from "@/components/app/hoot/dictate-button";

/**
 * "Ask anything about META…": a question here starts a new thread pinned to this holding (the research board's own
 * createHoldingChat) and opens it at /hoot/<id>. The question travels through sessionStorage, as from Home, so it never
 * lands in a URL; the thread sends it once it mounts. The chips send at once. Hoot's commands ("take me to risk")
 * run instead of asking.
 */
export function HoldingAsk({ teamId, holdingId, ticker, suggestions, configured }: { teamId: string; holdingId: string; ticker: string; suggestions: string[]; configured: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const runCommand = useHootCommand();
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const disabled = asking || !configured;

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || disabled) return;
    if (runCommand(q)) {
      setDraft("");
      return;
    }
    setAsking(true);
    try {
      const { id } = await createHoldingChat({ teamId, holdingId });
      if (!leaveHootQuestion(id, q, pageContextFor(pathname))) toast("Your thread is open. Paste your question to send it.");
      router.push(`/hoot/${id}`);
    } catch {
      toast.error("Couldn't open a thread just now. Try again in a moment.");
      setAsking(false);
    }
  };

  return (
    <div className="mt-[22px] rounded-composer border bg-surface">
      <label htmlFor="holding-ask" className="sr-only">
        Ask about {ticker}
      </label>
      <textarea
        id="holding-ask"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void ask(draft);
          }
        }}
        rows={1}
        disabled={disabled}
        placeholder={configured ? `Ask anything about ${ticker}…` : "Hoot isn't set up yet: an admin needs to turn it on"}
        className="block min-h-[54px] w-full resize-none bg-transparent px-[18px] pt-4 text-emph text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-70 [field-sizing:content]"
      />
      <div className="flex items-center gap-2 pt-2 pr-2.5 pb-2.5 pl-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => void ask(s)}
              title={s}
              className="h-[30px] max-w-[260px] truncate rounded-full border px-3 text-body text-ink-2 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
        <DictateButton value={draft} onChange={setDraft} disabled={disabled} size="round" className="size-[34px]" />
        <button
          type="button"
          aria-label={asking ? "Opening a thread" : "Send"}
          disabled={disabled || !draft.trim()}
          onClick={() => void ask(draft)}
          className="grid size-[34px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:bg-border-strong disabled:text-ink-2"
        >
          {asking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" strokeWidth={2.4} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
