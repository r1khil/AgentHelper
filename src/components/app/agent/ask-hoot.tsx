"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { startHootChat } from "@/lib/actions/chats";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** A question that isn't about one holding: starts a general conversation, the same way the floating Hoot does. */
export function AskHoot({ teamSlug, configured }: { teamSlug: string | null; configured: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Hoot's tour offers example questions; picking one puts it here to edit or send.
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
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="ask-hoot" className="sr-only">
        Ask Hoot
      </label>
      <div className="relative">
        <Textarea
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
          placeholder={configured ? "Ask Hoot anything: the portfolio, a sector, an upcoming report…" : "Hoot is not configured: add OPENROUTER_API_KEY"}
          className="min-h-16 resize-none bg-background pr-11 text-sm"
        />
        <Button type="submit" size="icon" className="absolute right-2 bottom-2 size-7" disabled={!text.trim() || asking} aria-label="Ask">
          <ArrowUp className="size-4" />
        </Button>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{asking ? "Opening a chat…" : "For one holding, open its research board below."}</div>
      {error && <div className="mt-1.5 text-xs text-destructive">{error}</div>}
    </form>
  );
}
