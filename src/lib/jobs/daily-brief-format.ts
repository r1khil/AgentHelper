import type { AttributionSummary } from "@/lib/attribution/summary";
import type { Source } from "@/lib/providers/types";

/** Who gets Hoot's 5:15 p.m. daily attribution email. */
export const DAILY_BRIEF_RECIPIENTS = [
  { name: "Aadi Patil", email: "apatil@theowlfund.com" },
  { name: "Saad Quddus", email: "squddus@theowlfund.com" },
  { name: "Rikhil Sharma", email: "rsharma@theowlfund.com" },
  { name: "Max Schmieder", email: "mschmieder@theowlfund.com" },
];

const signed = (x: number | null | undefined, unit: string) => (x === null || x === undefined ? "n/a" : `${x > 0 ? "+" : ""}${x}${unit}`);

/** The day's numbers, written by the app rather than the model, so the email's figures never depend on Hoot. */
export function factsBlock(s: AttributionSummary): string {
  const h = s.headline as AttributionSummary["headline"] & { spxPriceReturnPct?: number | null; activeVsSpxBps?: number | null };
  const row = (r: { ticker: string; team: string | null; returnPct: number | null; contributionBps: number | null }) =>
    `  ${r.ticker.padEnd(6)} ${signed(r.contributionBps, " bps").padStart(9)}  (return ${signed(r.returnPct, "%")}${r.team ? `, ${r.team}` : ""})`;
  const teams = "teams" in s && Array.isArray(s.teams) ? [...s.teams].sort((a, b) => (b.contributionBps ?? 0) - (a.contributionBps ?? 0)) : [];
  const lines = [
    `Fund return: ${signed(h.returnPct, "%")}   S&P 500: ${signed(h.spxPriceReturnPct, "%")}   Active vs S&P 500: ${signed(h.activeVsSpxBps, " bps")}`,
    `Vs sector benchmark: ${signed(h.activeVsSectorBenchmarkBps, " bps")} (allocation ${signed(h.allocationBps, "")}, selection ${signed(h.selectionBps, "")}, interaction ${signed(h.interactionBps, "")} bps)`,
  ];
  if (s.topContributors.length) lines.push("", "Top contributors:", ...s.topContributors.slice(0, 5).map(row));
  if (s.bottomContributors.length) lines.push("", "Biggest detractors:", ...s.bottomContributors.slice(0, 5).map(row));
  if (teams.length) lines.push("", "By team:", ...teams.map((t) => `  ${t.team}: ${signed(t.contributionBps, " bps")} (return ${signed(t.returnPct, "%")})`));
  if (s.dataNotices.length) lines.push("", ...s.dataNotices.map((n) => `Note: ${n}`));
  return lines.join("\n");
}

/**
 * Hoot cites with [src:ID] tokens, which mean nothing in an email. Number the sources it actually cited
 * in order of first use, drop tokens for ids no tool returned, and return the list for a footer.
 */
export function numberCitations(text: string, known: Map<string, Source>): { text: string; sources: Source[] } {
  const order: Source[] = [];
  const index = new Map<string, number>();
  const cite = (id: string) => {
    const s = known.get(id);
    if (!s) return "";
    if (!index.has(id)) {
      order.push(s);
      index.set(id, order.length);
    }
    return `[${index.get(id)}]`;
  };
  const out = text
    // [src:A] and the comma-joined [src:A, src:B] some models write.
    .replace(/\[(src:[^\]]+)\]/g, (_, inner: string) =>
      inner
        .split(/[,;]\s*/)
        .map((part) => cite(part.trim().replace(/^src:/, "")))
        .join(""),
    )
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
  return { text: out.trim(), sources: order };
}

/**
 * Keep only the brief itself: the text inside <brief> tags when the model used them, without Markdown
 * emphasis or headings (the email is plain text).
 */
export function cleanBrief(text: string): string {
  const tagged = /<brief>([\s\S]*?)(?:<\/brief>|$)/i.exec(text);
  return (tagged ? tagged[1] : text)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)__(.+?)__(?=\s|$)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sourcesFooter(sources: Source[]): string {
  if (!sources.length) return "";
  return ["Sources:", ...sources.map((s, i) => `[${i + 1}] ${s.title} (${s.publisher}${s.publishedAt ? `, ${s.publishedAt.slice(0, 10)}` : ""})${s.url ? ` ${s.url}` : ""}`)].join("\n");
}

export function briefEmail(opts: { sessionDate: string; facts: string; analysis: string | null; sources: Source[]; failure?: string; appUrl?: string }) {
  const subject = `Hoot's daily attribution: ${opts.sessionDate}`;
  const link = opts.appUrl ? `${opts.appUrl.replace(/\/$/, "")}/attribution` : null;
  const body = [
    `Daily attribution for ${opts.sessionDate} (previous close to today's close).`,
    "",
    opts.facts,
    "",
    "What Hoot found",
    "---------------",
    opts.analysis ?? `Hoot's analysis did not finish today${opts.failure ? ` (${opts.failure})` : ""}. The figures above are from the app's attribution and are complete.`,
    ...(opts.sources.length ? ["", sourcesFooter(opts.sources)] : []),
    "",
    ...(link ? [`Full attribution: ${link}`] : []),
    "Automated summary from Hoot, the Owl's Nest research assistant. Hoot gathers evidence; the interpretation is yours.",
  ].join("\n");
  return { subject, body };
}
