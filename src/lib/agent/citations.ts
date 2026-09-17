import type { UIMessage } from "ai";
import type { Source } from "@/lib/providers/types";

export const CITATION_RE = /\[src:\s*([A-Za-z0-9_\-]+(?:\s*,\s*[A-Za-z0-9_\-]+)*)\]/g;

/** Collect every Source returned by tool outputs across messages, keyed by id. */
export function collectSources(messages: UIMessage[]): Map<string, Source> {
  const map = new Map<string, Source>();
  for (const m of messages) {
    for (const p of m.parts) {
      if (typeof p.type === "string" && p.type.startsWith("tool-") && "state" in p && p.state === "output-available") {
        const out = (p as { output?: { sources?: Source[] } }).output;
        for (const s of out?.sources ?? []) map.set(s.id, s);
      }
    }
  }
  return map;
}

/** Heuristic: sentences with digits or % but no citation token. Labeled as a heuristic in the UI. */
export function uncitedFactCount(message: UIMessage) {
  let n = 0;
  for (const p of message.parts) {
    if (p.type !== "text") continue;
    const sentences = p.text.split(/(?<=[.!?])\s+|\n+/);
    for (const s of sentences) {
      if (/\d/.test(s) && !/\[src:/.test(s) && s.length > 20 && !/^#|^\|/.test(s.trim())) n++;
    }
  }
  return n;
}
