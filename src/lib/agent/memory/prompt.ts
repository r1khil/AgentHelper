import type { Source } from "@/lib/providers/types";

/** The fields of an agent memory that the prompt, the recall tool and the board all need. */
export type MemoryEntry = {
  id: string;
  kind: "log" | "fact" | "lesson";
  scope: "holding" | "team" | "fund";
  body: string;
  sources: Source[];
  meta?: { question?: string; nextQuestions?: string[]; chatId?: string; earningsId?: string } | null;
  createdAt: string;
  evidenceAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
};

const DAY = 86_400_000;
/** A fact whose evidence is older than this, and that no later turn has confirmed recently, stays out of the prompt. */
export const STALE_EVIDENCE_DAYS = 365;
export const STALE_VERIFY_DAYS = 180;
export const PROMPT_MAX_CHARS = 4000;

export const dateOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export function daysBetween(a: string | Date, b: string | Date) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}

/** Too old to inject unprompted; still reachable through the recall tool. */
export function isStaleFact(m: Pick<MemoryEntry, "kind" | "evidenceAt" | "verifiedAt">, now = new Date()) {
  if (m.kind !== "fact" || !m.evidenceAt) return false;
  if (daysBetween(m.evidenceAt, now) <= STALE_EVIDENCE_DAYS) return false;
  return !m.verifiedAt || daysBetween(m.verifiedAt, now) > STALE_VERIFY_DAYS;
}

/** "(evidence 2026-06-30, verified 2026-09-14)" or "(noted 2026-09-14)" for rows without evidence dates. */
export function ageLabel(m: Pick<MemoryEntry, "createdAt" | "evidenceAt" | "verifiedAt">) {
  if (!m.evidenceAt) return `(noted ${dateOf(m.createdAt)})`;
  return `(evidence ${dateOf(m.evidenceAt)}${m.verifiedAt ? `, verified ${dateOf(m.verifiedAt)}` : ""})`;
}

export function citationSuffix(m: Pick<MemoryEntry, "sources">) {
  return m.sources.map((s) => `[src:${s.id}]`).join("");
}

function fit(lines: string[], budget: number) {
  const out: string[] = [];
  let used = 0;
  for (const l of lines) {
    if (used + l.length + 1 > budget) break;
    out.push(l);
    used += l.length + 1;
  }
  return out;
}

/**
 * The research-log block for a pinned holding: recent log entries first, then unexpired, unstale facts
 * and lessons. Capped so a busy holding cannot crowd out the rest of the prompt.
 */
export function holdingMemoryBlock(ticker: string, entries: MemoryEntry[], now = new Date(), maxChars = PROMPT_MAX_CHARS): string {
  const live = entries.filter((m) => !(m.expiresAt && new Date(m.expiresAt) < now) && !isStaleFact(m, now));
  const logs = live.filter((m) => m.kind === "log").slice(0, 8);
  const facts = live.filter((m) => m.kind !== "log").slice(0, 10);
  if (logs.length === 0 && facts.length === 0) return "";
  const logLines = logs.map((m) => `- ${dateOf(m.createdAt)}: ${m.body}`);
  const factLines = facts.map((m) => `- ${m.kind === "lesson" ? "Lesson " : ""}${ageLabel(m)} ${m.body}${m.sources.length ? " " + citationSuffix(m) : ""}`);
  const header = `\n\nResearch log for ${ticker} (things the agent found in earlier chats; re-verify anything time-sensitive before relying on it, and re-check a fact whose evidence predates the latest filing before using its number):`;
  const parts: string[] = [];
  let budget = maxChars - header.length;
  if (logLines.length) {
    const fitted = fit(logLines, Math.min(budget, Math.ceil(maxChars * 0.5)));
    if (fitted.length) {
      parts.push(`Earlier questions:\n${fitted.join("\n")}`);
      budget -= fitted.join("\n").length + 20;
    }
  }
  if (factLines.length && budget > 80) {
    const fitted = fit(factLines, budget);
    if (fitted.length) parts.push(`Known facts and lessons (cite the tokens shown when you reuse one):\n${fitted.join("\n")}`);
  }
  return parts.length ? `${header}\n${parts.join("\n")}` : "";
}

/** Fund-wide facts (rates, index events) shared by every team; at most five, unexpired. */
export function fundMemoryBlock(entries: MemoryEntry[], now = new Date()): string {
  const live = entries.filter((m) => m.scope === "fund" && m.kind !== "log" && !(m.expiresAt && new Date(m.expiresAt) < now) && !isStaleFact(m, now)).slice(0, 5);
  if (!live.length) return "";
  return `\n\nFund-wide notes (recorded by the agent; verify before quoting numbers):\n${live.map((m) => `- ${ageLabel(m)} ${m.body}${m.sources.length ? " " + citationSuffix(m) : ""}`).join("\n")}`;
}
