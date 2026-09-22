/** How many documents and which dates a result spans, so the model notices when old quarters are mixed in. */
export function passageCoverage(passages: { documentId: string; documentDate: string | null }[], latest?: number) {
  if (!passages.length) return undefined;
  const byDoc = new Map(passages.map((p) => [p.documentId, p.documentDate]));
  const dates = [...byDoc.values()].filter((d): d is string => !!d).sort();
  const span = dates.length ? (dates[0] === dates.at(-1) ? `dated ${dates[0]}` : `dated ${dates[0]} to ${dates.at(-1)}`) : "undated";
  const hint = !latest && new Set(dates).size > 1 ? " If the question is about the latest report only, search again with latest: 1 rather than mixing quarters." : "";
  return `${byDoc.size} document${byDoc.size === 1 ? "" : "s"}, ${span}.${hint}`;
}

/** The document types an earnings-kind Drive file can be, as `documentLabel` names them. */
export const EARNINGS_DOC_TYPES = {
  earnings_update: "Earnings update",
  pre_earnings: "Pre-earnings",
  transcript: "Earnings transcript",
  major_movement: "Major movement",
} as const;
export type EarningsDocType = keyof typeof EARNINGS_DOC_TYPES;

export type RecencyCandidate = { id: string; kind: "drive" | "filing" | "web"; date: string | null; label: string | null };

/**
 * The newest `n` documents from candidates already sorted newest first. Filings filed the same day count as one
 * report (an 8-K with its EX-99.1 release and EX-99.2 supplement), so "latest 1" keeps the whole package. Drive files
 * can be narrowed to document types; a major-movement note is not an earnings document, so it is skipped unless asked for.
 */
export function pickNewest(candidates: RecencyCandidate[], n: number, opts: { labels?: string[]; excludeLabels?: string[] } = {}): string[] {
  const groups: string[] = [];
  const out: string[] = [];
  for (const c of candidates) {
    if (c.kind === "drive" && c.label) {
      if (opts.labels?.length && !opts.labels.includes(c.label)) continue;
      if (opts.excludeLabels?.includes(c.label)) continue;
    }
    const group = c.kind === "filing" && c.date ? `filing:${c.date}` : c.id;
    if (!groups.includes(group)) {
      if (groups.length >= n) break;
      groups.push(group);
    }
    out.push(c.id);
  }
  return out;
}
