import { DateTime } from "luxon";
import type { AttributionSummary } from "@/lib/attribution/summary";
import { fmtAccounting } from "@/lib/format";
import type { Source } from "@/lib/providers/types";

/** Who gets Hoot's 5:15 p.m. daily attribution email, in the order they are addressed (first in To, the rest in Cc). */
export const DAILY_BRIEF_RECIPIENTS = [
  { name: "Aadi Patil", email: "apatil@theowlfund.com" },
  { name: "Saad Quddus", email: "squddus@theowlfund.com" },
  { name: "Rikhil Sharma", email: "rsharma@theowlfund.com" },
  { name: "Max Schmieder", email: "mschmieder@theowlfund.com" },
];

/** Accounting style, as the app shows it: "(0.29%)", "12 bp"; "n/a" when there is no figure. */
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : fmtAccounting(x, 2, "%"));
const bp = (x: number | null | undefined, unit = " bp") => (x === null || x === undefined ? "n/a" : fmtAccounting(x, 0, unit));

/** The day's numbers, written by the app rather than the model, so the email's figures never depend on Hoot. */
export function factsBlock(s: AttributionSummary): string {
  const h = s.headline as AttributionSummary["headline"] & { spxPriceReturnPct?: number | null; activeVsSpxBps?: number | null };
  const row = (r: { ticker: string; team: string | null; returnPct: number | null; contributionBps: number | null }) =>
    `  ${r.ticker.padEnd(6)} ${bp(r.contributionBps).padStart(9)}  (return ${pct(r.returnPct)}${r.team ? `, ${r.team}` : ""})`;
  const teams = "teams" in s && Array.isArray(s.teams) ? [...s.teams].sort((a, b) => (b.contributionBps ?? 0) - (a.contributionBps ?? 0)) : [];
  const lines = [
    `Fund return: ${pct(h.returnPct)}   S&P 500: ${pct(h.spxPriceReturnPct)}   Active vs S&P 500: ${bp(h.activeVsSpxBps)}`,
    `Vs sector benchmark: ${bp(h.activeVsSectorBenchmarkBps)} (allocation ${bp(h.allocationBps, "")}, selection ${bp(h.selectionBps, "")}, interaction ${bp(h.interactionBps, "")} bp)`,
  ];
  if (s.topContributors.length) lines.push("", "Top contributors:", ...s.topContributors.slice(0, 5).map(row));
  if (s.bottomContributors.length) lines.push("", "Biggest detractors:", ...s.bottomContributors.slice(0, 5).map(row));
  if (teams.length) lines.push("", "By team:", ...teams.map((t) => `  ${t.team}: ${bp(t.contributionBps)} (return ${pct(t.returnPct)})`));
  if (s.dataNotices.length) lines.push("", ...s.dataNotices.map((n) => `Note: ${n}`));
  return lines.join("\n");
}

const byContribution = <T extends { contributionBps: number | null }>(rows: T[]) => [...rows].sort((a, b) => (b.contributionBps ?? 0) - (a.contributionBps ?? 0));

/**
 * The attribution Hoot reads, from a summary built without a holdings limit: every holding, and sectors,
 * teams and holdings each sorted from the largest contribution to the smallest, so that "best", "worst" and
 * "only" come from the data rather than from the model's arithmetic.
 */
export function researchView(all: AttributionSummary) {
  const { topContributors, bottomContributors, ...rest } = all;
  return {
    ...rest,
    sectors: byContribution(rest.sectors),
    ...("teams" in rest && Array.isArray(rest.teams) ? { teams: byContribution(rest.teams) } : {}),
    holdings: byContribution([...topContributors, ...bottomContributors]),
  };
}

/** What a daily_brief job run stored (runDailyBriefAnalysis's result). */
export type AnalysisRun = { status: "ok" | "skipped" | "failed"; reason?: string; facts?: string; summaryHash?: string; analysis?: string; sources?: Source[] };

/**
 * Hoot's newest analysis written from exactly the numbers the email will print (same summary hash; runs from
 * before the hash existed compare their facts text), or why there is none. `runs` are newest first;
 * `attempts` counts the runs made for these numbers.
 */
export function chooseAnalysis(runs: AnalysisRun[], current: { hash: string; facts: string }): { analysis: AnalysisRun | null; reason: string; attempts: number } {
  const same = runs.filter((r) => (r.summaryHash ? r.summaryHash === current.hash : r.facts === current.facts));
  const ok = same.find((r) => r.status === "ok" && r.analysis);
  if (ok) return { analysis: ok, reason: "", attempts: same.length };
  const latest = runs[0];
  const reason = same[0]?.reason ?? (!latest ? "it did not run" : latest.status === "ok" ? "the numbers changed after it was written" : (latest.reason ?? "it failed"));
  return { analysis: null, reason, attempts: same.length };
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
    .trim()
    // The email adds its own greeting and sign-off; drop any the model wrote.
    .replace(/^(hi|hello|hey|dear)\b[^\n]*,\s*\n+/i, "")
    .replace(/\n+\s*(best|thanks|regards|cheers|best regards|kind regards)\b[,.!]?(\s*(\n\s*)?hoot\.?)?\s*$/i, "")
    .trim();
}

export function sourcesFooter(sources: Source[]): string {
  if (!sources.length) return "";
  return ["Sources:", ...sources.map((s, i) => `[${i + 1}] ${s.title} (${s.publisher}${s.publishedAt ? `, ${s.publishedAt.slice(0, 10)}` : ""})${s.url ? ` ${s.url}` : ""}`)].join("\n");
}

/** "Tuesday, September 22" for an ISO session date. */
function longDate(iso: string) {
  return DateTime.fromISO(iso).toFormat("cccc, LLLL d");
}

export function briefEmail(opts: { sessionDate: string; facts: string; analysis: string | null; sources: Source[]; failure?: string; appUrl?: string }) {
  const subject = `Owl Fund Daily Attribution Analysis (${DateTime.fromISO(opts.sessionDate).toFormat("dd-LLL-yyyy")})`;
  const link = opts.appUrl ? `${opts.appUrl.replace(/\/$/, "")}/attribution` : null;
  const opening = opts.analysis
    ? [`Here's what drove the fund on ${longDate(opts.sessionDate)}.`, "", opts.analysis]
    : [`My analysis of ${longDate(opts.sessionDate)} didn't finish${opts.failure ? ` (${opts.failure})` : ""}, so here are just the numbers. They come straight from the app's attribution and are complete.`];
  const body = [
    "Hi all,",
    "",
    ...opening,
    "",
    "The numbers, close to close:",
    "",
    opts.facts,
    ...(opts.sources.length ? ["", sourcesFooter(opts.sources)] : []),
    ...(link ? ["", `The full breakdown is on the Attribution page: ${link}`] : []),
    "",
    "Feel free to reply with any questions.",
    "",
    "Best,",
    "Hoot",
  ].join("\n");
  return { subject, body };
}

/** Tells the admins the brief has not gone out: once while the evening's retries continue, once when they run out. */
export function briefAlertEmail(opts: { sessionDate: string; final: boolean; error: string; appUrl?: string }) {
  const day = longDate(opts.sessionDate);
  const admin = opts.appUrl ? `the Admin page (${opts.appUrl.replace(/\/$/, "")}/admin)` : "the Admin page";
  const body = [
    "Hi,",
    "",
    opts.final
      ? `The daily attribution email for ${day} never went out. I tried at 5:15 p.m. and every 15 minutes after that until 11:45 p.m.`
      : `The daily attribution email for ${day} hasn't gone out yet. I'll keep trying every 15 minutes until midnight New York time.`,
    "",
    `What went wrong: ${opts.error}`,
    "",
    `To send it yourself, open ${admin}, set the date under "Hoot's daily attribution brief" to ${opts.sessionDate}, tick "Email everyone on the list, not just me" and press Run.`,
    "",
    "Hoot",
  ].join("\n");
  return { subject: `Daily attribution email not sent (${DateTime.fromISO(opts.sessionDate).toFormat("dd-LLL-yyyy")})`, body };
}
