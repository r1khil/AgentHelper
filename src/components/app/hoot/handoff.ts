// Hoot's quick ask creates the chat, then hands the question to the chat page through sessionStorage
// (not the URL, so questions never land in history or logs). The chat surface sends it once mounted,
// with the page it was asked from as the message's metadata.
import { parsePageContext, type PageContext } from "@/lib/agent/page-context";

const key = (chatId: string) => `hoot:ask:${chatId}`;

export type HootQuestion = { text: string; page: PageContext | null };

export function leaveHootQuestion(chatId: string, text: string, page?: PageContext | null) {
  try {
    sessionStorage.setItem(key(chatId), JSON.stringify({ text, page: page ?? null }));
    return true;
  } catch {
    return false;
  }
}

export function peekHootQuestion(chatId: string): HootQuestion | null {
  try {
    const raw = sessionStorage.getItem(key(chatId));
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { text?: unknown; page?: unknown };
      if (typeof v?.text === "string") return { text: v.text, page: parsePageContext(v.page) };
    } catch {
      // Left by an older tab: plain text.
    }
    return { text: raw, page: null };
  } catch {
    return null;
  }
}

export function clearHootQuestion(chatId: string) {
  try {
    sessionStorage.removeItem(key(chatId));
  } catch {
    // Storage blocked: nothing was saved either.
  }
}
