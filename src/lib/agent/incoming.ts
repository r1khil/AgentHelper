import type { UIMessage } from "ai";

/**
 * The conversation with a newly sent question appended. The browser picks the message id, so an id that is already
 * saved is either the same question sent twice (the last message, a question: keep the saved copy) or an attempt to
 * overwrite something else in the chat, such as one of Hoot's answers, which the whole team sees: refused.
 */
export function appendQuestion(prior: UIMessage[], incoming: UIMessage): { messages: UIMessage[] } | { error: string } {
  const at = prior.findIndex((m) => m.id === incoming.id);
  if (at === -1) return { messages: [...prior, { ...incoming, role: "user" }] };
  if (at === prior.length - 1 && prior[at].role === "user") return { messages: prior };
  return { error: "That message is already part of this conversation." };
}
