import type { Source } from "@/lib/providers/types";
import { PREP_SECTION_KEYS, type PrepPack, type PrepSection, type PrepSectionKey } from "./prep-types";

export const PREP_TITLES: Record<PrepSectionKey, string> = {
  last_quarter: "Last reported quarter",
  prior_guidance: "Guidance and outlook on record",
  consensus: "Street consensus (not guidance)",
  team_questions: "The team's own questions on file",
  watch_items: "Items to watch in the report",
  not_retrieved: "Not retrieved",
};

/** Phrases that would turn evidence into a forecast; a bullet containing one is dropped. */
export const PREDICTIVE_RE = /\b(we expect|i expect|expect(?:s|ed)? to (?:beat|miss)|likely (?:to )?(?:beat|miss)|should (?:beat|miss|report|see|deliver)|will (?:beat|miss|likely|probably)|our (?:view|forecast|estimate|expectation)|my (?:view|forecast|estimate|expectation)|buy|sell|overweight|underweight|price target of ours)\b/i;

/** Whether a raw section key is one of ours. */
export function isSectionKey(v: unknown): v is PrepSectionKey {
  return typeof v === "string" && (PREP_SECTION_KEYS as readonly string[]).includes(v);
}

export type PrepValidation = { pack: PrepPack; dropped: { unknownSource: number; predictive: number; empty: number; /** A few of the dropped bullets, for prompt tuning. */ samples: string[] } };

/**
 * Turn the model's JSON into a stored pack: only known section keys, only source ids that a tool
 * actually returned this run, no predictive language, and the cited sources carried alongside.
 * `not_retrieved` bullets need no source; every other bullet needs at least one.
 */
export function validatePrepPack(raw: unknown, known: Map<string, Source>, meta: { reportDate: string; model: string; builtAt?: string }): PrepValidation {
  const dropped: PrepValidation["dropped"] = { unknownSource: 0, predictive: 0, empty: 0, samples: [] };
  const sample = (why: string, text: string, ids: string[] = []) => {
    if (dropped.samples.length < 6) dropped.samples.push(`${why}: ${text.slice(0, 100)}${ids.length ? ` [${ids.join(",")}]` : ""}`);
  };
  const r = (raw && typeof raw === "object" ? raw : {}) as { sections?: unknown };
  const byKey = new Map<PrepSectionKey, PrepSection>();
  // Accept both shapes models produce: [{key, bullets}] and {key: bullets}.
  const list: { key?: unknown; bullets?: unknown }[] = Array.isArray(r.sections)
    ? (r.sections as unknown[]).map((s) => (s && typeof s === "object" ? (s as { key?: unknown; bullets?: unknown }) : {}))
    : r.sections && typeof r.sections === "object"
      ? Object.entries(r.sections as Record<string, unknown>).map(([key, v]) => ({ key, bullets: Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { bullets?: unknown }).bullets) ? (v as { bullets: unknown }).bullets : [] }))
      : [];
  for (const sec of list) {
    if (!isSectionKey(sec.key)) continue;
    const key = sec.key;
    const bullets: PrepSection["bullets"] = [];
    for (const b of Array.isArray(sec.bullets) ? sec.bullets : []) {
      const o = (b && typeof b === "object" ? b : { text: b }) as { text?: unknown; sourceIds?: unknown };
      // Models often write [src:ID] inside the text as well; the card shows numbered chips, so lift the ids out.
      const inline: string[] = [];
      const text = (typeof o.text === "string" ? o.text : "")
        .replace(/\s*\[src:\s*([^\]]+)\]/g, (_, ids: string) => {
          inline.push(...ids.split(",").map((x) => x.replace(/^\s*src:\s*/, "").trim()).filter(Boolean));
          return "";
        })
        .replace(/\s+/g, " ")
        .trim();
      if (!text) {
        dropped.empty++;
        continue;
      }
      if (key !== "not_retrieved" && PREDICTIVE_RE.test(text)) {
        dropped.predictive++;
        sample("predictive", text);
        continue;
      }
      const ids = [...new Set([...(Array.isArray(o.sourceIds) ? o.sourceIds : []).filter((x): x is string => typeof x === "string").map((x) => x.replace(/^\s*src:\s*/, "").trim()), ...inline])];
      const valid = ids.filter((id) => known.has(id));
      if (key !== "not_retrieved" && valid.length === 0) {
        dropped.unknownSource++;
        sample("unknown source", text, ids);
        continue;
      }
      bullets.push({ text: text.slice(0, 600), sourceIds: valid });
    }
    const existing = byKey.get(key);
    byKey.set(key, { key, title: PREP_TITLES[key], bullets: [...(existing?.bullets ?? []), ...bullets].slice(0, 10) });
  }
  const sections = PREP_SECTION_KEYS.map((k) => byKey.get(k)).filter((s): s is PrepSection => !!s && s.bullets.length > 0);
  const cited = new Set(sections.flatMap((s) => s.bullets.flatMap((b) => b.sourceIds)));
  const sources = [...known.values()].filter((s) => cited.has(s.id));
  return { pack: { reportDate: meta.reportDate, sections, sources, builtAt: meta.builtAt ?? new Date().toISOString(), model: meta.model }, dropped };
}

/**
 * Repair the JSON a model tends to produce: code fences, trailing commas, and an object cut off by
 * the output limit (unterminated string, unclosed arrays and objects). Returns the repaired text.
 */
export function repairJson(raw: string): string {
  let t = raw.replace(/```(?:json)?/gi, "").trim();
  // Walk the text tracking string state so bracket balancing ignores braces inside strings.
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let out = "";
  for (const ch of t) {
    out += ch;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) out += '"';
  // A dangling `"text":` or `,` before the cut leaves invalid JSON; trim back to the last complete value.
  out = out.replace(/,\s*("[^"]*"\s*:\s*)?$/, "").replace(/("[^"]*"\s*:\s*)$/, "");
  while (stack.length) out += stack.pop();
  t = out.replace(/,(\s*[}\]])/g, "$1");
  return t;
}

/** Lenient JSON extraction: the object starting at the first `{`, repaired when the model cut it short. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const end = text.lastIndexOf("}");
  const candidates = end > start ? [text.slice(start, end + 1), text.slice(start)] : [text.slice(start)];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      try {
        return JSON.parse(repairJson(c));
      } catch {
        /* try the next candidate */
      }
    }
  }
  return null;
}

export type PrepCandidate = { id: string; reportDate: string; status: string; prepPackAt: Date | null; prepPackError: string | null };

/** Attempts recorded in the error text ("attempt 2: …"), so a failed build is retried once and then left alone. */
export function prepAttempts(error: string | null) {
  const m = error?.match(/^attempt (\d+):/);
  return m ? Number(m[1]) : error ? 1 : 0;
}

/**
 * Upcoming reports inside the window with no pack yet and at most one failed attempt, soonest first.
 * `window` is inclusive ISO dates; the caller derives it from NY business days.
 */
export function selectPrepCandidates<T extends PrepCandidate>(rows: T[], window: { from: string; to: string }, limit = 3, maxAttempts = 2): T[] {
  return rows
    .filter((r) => r.status === "upcoming" && r.reportDate >= window.from && r.reportDate <= window.to && !r.prepPackAt && prepAttempts(r.prepPackError) < maxAttempts)
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .slice(0, limit);
}

/** Bullet text without any [src:ID] tokens a model wrote inline (older packs kept them; the card shows chips instead). */
export function cleanBulletText(text: string) {
  return text.replace(/\s*\[src:\s*[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

export function bulletCount(pack: PrepPack) {
  return pack.sections.reduce((n, s) => n + (s.key === "not_retrieved" ? 0 : s.bullets.length), 0);
}
