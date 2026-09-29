"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startHootChat } from "@/lib/actions/chats";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { useHootCommand } from "@/components/app/hoot/use-hoot-command";

/**
 * A question asked from a conversation page (Home, Research): open a chat that fits (a holding's board when a ticker is
 * named, else a general conversation filed under the team), hand it the question through sessionStorage so it never
 * lands in a URL, and go there. Hoot's commands ("take me to risk", "turn on light mode") run instead of asking.
 * `start` resolves once the chat is opening; `error` says why it didn't.
 */
export function useStartChat() {
  const router = useRouter();
  const runCommand = useHootCommand();
  const [asking, setAsking] = useState(false);
  // The state updates a render late; the ref stops a second Enter or click from opening a second chat meanwhile.
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (question: string, target: { teamSlug: string | null; ticker?: string | null }): Promise<boolean> => {
      const q = question.trim();
      if (!q || busy.current) return false;
      if (runCommand(q)) {
        setError(null);
        return true;
      }
      busy.current = true;
      setAsking(true);
      setError(null);
      let opened = false;
      try {
        const res = await startHootChat({ teamSlug: target.teamSlug, ticker: target.ticker ?? null });
        if ("error" in res) {
          setError(res.error);
          return false;
        }
        if (!leaveHootQuestion(res.chatId, q)) toast("Your chat is open. Paste your question to send it.");
        router.push(res.href);
        opened = true;
        return true;
      } catch {
        setError("Couldn't open a chat just now. Try again in a moment.");
        return false;
      } finally {
        // Once the chat is opening, stay busy until the page changes: the box must not take the question twice.
        if (!opened) {
          busy.current = false;
          setAsking(false);
        }
      }
    },
    [router, runCommand],
  );

  return { asking, error, start };
}
