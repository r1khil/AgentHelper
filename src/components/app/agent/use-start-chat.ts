"use client";

import { useCallback, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (question: string, target: { teamSlug: string | null; ticker?: string | null }): Promise<boolean> => {
      const q = question.trim();
      if (!q || asking) return false;
      if (runCommand(q)) {
        setError(null);
        return true;
      }
      setAsking(true);
      setError(null);
      try {
        const res = await startHootChat({ teamSlug: target.teamSlug, ticker: target.ticker ?? null });
        if ("error" in res) {
          setError(res.error);
          return false;
        }
        if (!leaveHootQuestion(res.chatId, q)) toast("Your chat is open. Paste your question to send it.");
        router.push(res.href);
        return true;
      } catch {
        setError("Couldn't open a chat just now. Try again in a moment.");
        return false;
      } finally {
        setAsking(false);
      }
    },
    [asking, router, runCommand],
  );

  return { asking, error, start };
}
