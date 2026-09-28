"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { startHootChat } from "@/lib/actions/chats";
import { leaveHootQuestion } from "./handoff";
import { pageContextFor } from "./page-context";

/**
 * The one way a question reaches Hoot from outside Research: open a chat that fits (a holding's research board, or a
 * general conversation), hand it the question with the page it was asked from, and go there. ⌘K and the pages'
 * written-for-you "Ask Hoot" buttons both come through here. Resolves true once the chat is opening.
 */
export function useAskHoot() {
  const router = useRouter();
  const pathname = usePathname();
  const [asking, setAsking] = useState(false);
  const ask = useCallback(
    async (question: string, target: { teamSlug: string | null; ticker: string | null }) => {
      setAsking(true);
      try {
        // Read at the moment of asking, so it reflects the period or scenario on screen right now.
        const page = pageContextFor(pathname);
        const res = await startHootChat(target);
        if ("error" in res) {
          toast.error(res.error);
          return false;
        }
        if (!leaveHootQuestion(res.chatId, question, page)) toast("Your chat is open. Paste your question to send it.");
        router.push(res.href);
        return true;
      } catch {
        toast.error("Couldn't open a chat just now. Try again in a moment.");
        return false;
      } finally {
        setAsking(false);
      }
    },
    [pathname, router],
  );
  return { asking, ask };
}
