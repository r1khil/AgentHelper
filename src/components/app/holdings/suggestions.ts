import type { MemoryEntry } from "@/lib/agent/memory/prompt";

/**
 * The chips under a holding's ask box: the follow-ups Hoot suggested in his latest research-log note, else `fallback`.
 * The same rule as the research board's (research-log-card's suggestionsFor), in a module the server page can call.
 */
export function holdingSuggestions(memories: MemoryEntry[], fallback: () => string[]) {
  const latest = memories.find((m) => m.kind === "log" && m.meta?.nextQuestions?.length);
  const qs = latest?.meta?.nextQuestions?.filter((q) => q.trim().length > 10).slice(0, 3) ?? [];
  return qs.length ? qs : fallback();
}
