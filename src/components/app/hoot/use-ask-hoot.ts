"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { startHootChat } from "@/lib/actions/chats";
import { pageContextLabel } from "@/lib/agent/page-context";
import { openAnswerPanel } from "./answer-panel-store";
import { leaveHootQuestion } from "./handoff";
import { pageContextFor } from "./page-context";
import { useHootCommand } from "./use-hoot-command";

/** Pages that are Hoot's own conversations: Home, a thread and All threads. A question asked there opens the thread. */
export const onConversationPage = (pathname: string) => pathname === "/" || /^\/hoot(\/|$)/.test(pathname);

/**
 * The one way a question reaches Hoot from a page: open a chat that fits, hand it the question with the page it was asked
 * from, and show the answer. On an ordinary page the answer slides in as a panel over it (with "Open as a full thread"
 * for the whole conversation); a question about one holding opens its thread (filed under the holding), and on Home and
 * the threads, which are conversations themselves, it opens the thread. ⌘J and the pages' written-for-you "Ask Hoot"
 * buttons both come through here. Resolves true once the chat is opening.
 */
export function useAskHoot() {
  const router = useRouter();
  const pathname = usePathname();
  const [asking, setAsking] = useState(false);
  // Guards a second press before `asking` re-renders, which would open a second chat with the same question.
  const busy = useRef(false);
  const runCommand = useHootCommand();
  const ask = useCallback(
    async (question: string, target: { teamSlug: string | null; ticker: string | null }, opts: { withPage?: boolean } = {}) => {
      // A plain "go to …" or "dark mode" is done at once, without a chat; anything else Hoot handles, tools included.
      if (runCommand(question)) return true;
      if (busy.current) return false;
      busy.current = true;
      setAsking(true);
      try {
        // Read at the moment of asking, so it reflects the period or scenario on screen right now. Left out when the
        // member asked about the whole app instead of this page.
        const page = opts.withPage === false ? null : pageContextFor(pathname);
        const res = await startHootChat(target);
        if ("error" in res) {
          toast.error(res.error);
          return false;
        }
        const left = leaveHootQuestion(res.chatId, question, page);
        if (target.ticker || onConversationPage(pathname)) {
          if (!left) toast("Your chat is open. Paste your question to send it.");
          router.push(res.href);
        } else if (!left) {
          // The panel reads the question from the same hand-off; without it, the thread is the way to send it.
          toast("Your chat is open. Paste your question to send it.");
          router.push(res.href);
        } else {
          openAnswerPanel({ chatId: res.chatId, href: res.href, context: page ? (page.kind === "page" ? page.title : pageContextLabel(page)) : "The whole app" });
        }
        return true;
      } catch {
        toast.error("Couldn't open a chat just now. Try again in a moment.");
        return false;
      } finally {
        busy.current = false;
        setAsking(false);
      }
    },
    [pathname, router, runCommand],
  );
  return { asking, ask };
}
