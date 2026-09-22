// Hoot's quick ask creates the chat, then hands the question to the chat page through sessionStorage
// (not the URL, so questions never land in history or logs). The chat surface sends it once mounted.

const key = (chatId: string) => `hoot:ask:${chatId}`;

export function leaveHootQuestion(chatId: string, text: string) {
  try {
    sessionStorage.setItem(key(chatId), text);
    return true;
  } catch {
    return false;
  }
}

export function peekHootQuestion(chatId: string): string | null {
  try {
    return sessionStorage.getItem(key(chatId));
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
