"use client";

import { useHootCommand } from "@/components/app/hoot/use-hoot-command";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { startHootChat } from "@/lib/actions/chats";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { ComposerBox, LEARNING_BOUNDARY, SendButton } from "@/components/app/chat/thread-parts";
import { cn } from "@/lib/utils";

/** A question that isn't about one holding: starts a general conversation, the same way the floating Hoot does. */
export function AskHoot({ teamSlug, configured, hint, className }: { teamSlug: string | null; configured: boolean; hint: string; className?: string }) {
  const router = useRouter();
  const runCommand = useHootCommand();
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Hoot's tour offers example questions (and the suggestions above the box); picking one puts it here to edit or send.
  useEffect(() => {
    const fill = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q !== "string") return;
      setText(q);
      box.current?.focus({ preventScroll: true });
    };
    window.addEventListener("hoot:fill-ask", fill);
    return () => window.removeEventListener("hoot:fill-ask", fill);
  }, []);

  const submit = async () => {
    const q = text.trim();
    if (!q || asking) return;
    if (runCommand(q)) {
      setText("");
      setError(null);
      return;
    }
    setAsking(true);
    setError(null);
    try {
      const res = await startHootChat({ teamSlug, ticker: null });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      if (!leaveHootQuestion(res.chatId, q)) toast("Your chat is open. Paste your question to send it.");
      router.push(res.href);
    } catch {
      setError("Couldn't open a chat just now. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <form
      data-tour="ask-hoot"
      className={cn("shrink-0", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="ask-hoot" className="sr-only">
        Ask Hoot
      </label>
      <ComposerBox>
        <textarea
          ref={box}
          id="ask-hoot"
          value={text}
          rows={2}
          disabled={asking || !configured}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={configured ? "Ask Hoot anything: the portfolio, a sector, an upcoming report…" : "Hoot isn't set up yet: an admin needs to turn it on"}
          className="field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent text-sm leading-[22px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{asking ? "Opening a chat…" : hint}</span>
          <span className="flex-1" />
          <SendButton disabled={!text.trim() || asking || !configured} label="Ask" />
        </div>
      </ComposerBox>
      {error ? <div className="mt-1.5 text-xs text-destructive">{error}</div> : <div className="mt-1.5 text-[11.5px] text-muted-foreground">{LEARNING_BOUNDARY}</div>}
    </form>
  );
}
