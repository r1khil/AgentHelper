import { agendaLine, agendaLines, figureLines, itemsToLines, performerLine } from "./format";
import { AGENDA_LABELS, AGENDA_SECTIONS, type WeeklyAgenda, type WeeklyFigures, type WeeklyPerformers, type WeeklySources } from "./types";
import { packTitle, weekEndingLabel } from "./weeks";

/**
 * The Sunday email to the exec who builds the deck: every data point on the slide, in the deck's order and style, so each
 * section pastes straight in. Pure, so the exact text is tested; `email.ts` sends it.
 */

export type WeeklyEmailInput = {
  weekEnding: string;
  figures: WeeklyFigures;
  performers: WeeklyPerformers | null;
  agenda: WeeklyAgenda;
  lastWeekAgenda: WeeklyAgenda | null;
  sources: WeeklySources;
  /** First name of the person in To, when the app knows it. */
  toName?: string | null;
};

/** Aadi builds and sends the deck; Saad is copied. Used when the Admin setting is blank. */
export const WEEKLY_EMAIL_DEFAULT = ["apatil@theowlfund.com", "squddus@theowlfund.com"];

/** Test accounts never receive real email. Listing only test accounts is how the Sunday email is paused. */
export function isTestAddress(email: string) {
  return email.endsWith(".owlfund.local");
}

export function parseRecipients(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? "").split(/[,\n]/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** The first real address goes in To and the rest in CC; test accounts are set aside in `skipped`. */
export function splitRecipients(listed: string[]): { to: string | null; cc: string[]; skipped: string[] } {
  const all = listed.length ? listed : WEEKLY_EMAIL_DEFAULT;
  const real = all.filter((e) => !isTestAddress(e));
  return { to: real[0] ?? null, cc: real.slice(1), skipped: all.filter(isTestAddress) };
}

export function weeklyEmailSubject(weekEnding: string): string {
  return `Weekly update data for the week ended ${weekEndingLabel(weekEnding)}`;
}

const FIGURE_LABELS: Record<keyof WeeklyFigures, string> = { aumK: "AUM", ytdPct: "The YTD return", benchmarkYtdPct: "The benchmark YTD" };
const STEP_LABELS: Record<string, string> = {
  carry: "last week's agenda",
  sheet: "the PT sheet",
  performers: "the top and worst 3",
  earnings: "Earnings",
  marketNews: "Market News",
  processUpdates: "the fund calendar",
};

/** What to look at before pasting: steps that failed, figures that aren't this week's, and the performers' own notes. */
export function weeklyChecks(input: Pick<WeeklyEmailInput, "figures" | "performers" | "sources">): string[] {
  const out: string[] = [];
  for (const [step, entry] of Object.entries(input.sources)) {
    // Only the build's own steps: the email's delivery record isn't something to check in the deck.
    if (entry.status !== "failed" || !(step in STEP_LABELS)) continue;
    out.push(`Couldn't read ${STEP_LABELS[step]}${entry.error ? `: ${entry.error}` : ""}.`);
  }
  for (const key of Object.keys(FIGURE_LABELS) as (keyof WeeklyFigures)[]) {
    const f = input.figures[key];
    if (f.value === null) out.push(`${FIGURE_LABELS[key]} is missing; take it from the PT sheet.`);
    else if (f.source === "carried") out.push(`${FIGURE_LABELS[key]} is last week's number; the PT sheet wasn't read, so check it.`);
  }
  if (!input.performers) out.push("There are no top and worst 3 this week.");
  else {
    out.push(...(input.performers.checks ?? []));
    if (input.performers.missing.length) out.push(`No Monday and Friday closes for ${input.performers.missing.join(", ")}; they're left out of the top and worst 3.`);
  }
  return out;
}

const heading = (s: string) => s.toUpperCase();

export function weeklyEmailText(input: WeeklyEmailInput): string {
  const p = input.performers;
  const processUpdates = input.agenda.processUpdates.length
    ? agendaLine(AGENDA_LABELS.processUpdates, input.agenda.processUpdates)
    : `${AGENDA_LABELS.processUpdates}: (add this week's)`;
  const lastWeekProcess = input.lastWeekAgenda?.processUpdates ?? [];
  const checks = weeklyChecks(input);

  const lines = [
    input.toName ? `Hi ${input.toName},` : "Hi,",
    "",
    "Here is everything for Monday's weekly update deck, in the deck's order. Each section is ready to paste.",
    "",
    `The numbers and lists are pulled automatically from the PT sheet, the fund calendar and market data.${p?.why?.length ? ` The "Why they moved" lines are my AI read of the week's news.` : ""} Reply with any changes (for example "drop Wholesale Trade, add ORCL on Tuesday") and I'll update the pack and send back the new lines.`,
    "",
    packTitle(input.weekEnding),
    "",
    heading("Portfolio Highlights"),
    ...figureLines(input.figures),
    "",
    heading("Top 3 Performers"),
    ...(p?.top.length ? p.top.map(performerLine) : ["(none)"]),
    "",
    heading("Worst 3 Performers"),
    ...(p?.worst.length ? p.worst.map(performerLine) : ["(none)"]),
    "",
    ...whySection(p),
    heading("Last Week's Agenda"),
    ...agendaLines(input.lastWeekAgenda),
    "",
    heading("This Week's Agenda"),
    ...AGENDA_SECTIONS.filter((s) => s !== "processUpdates").map((s) => agendaLine(AGENDA_LABELS[s], input.agenda[s])),
    processUpdates,
    ...(lastWeekProcess.length && !input.agenda.processUpdates.length ? ["", "Last week's process updates, for reference:", itemsToLines(lastWeekProcess)] : []),
    "",
    heading("YTD Performance chart"),
    "Not included: paste it from the price target sheet as usual.",
    "",
    heading("Checks"),
    ...(checks.length ? checks.map((c) => `- ${c}`) : ["Nothing to flag."]),
    "",
    sourcesLine(p),
    "Please double check figures for accuracy.",
    "",
    "Feel free to reply with any questions.",
    "",
    "Best,",
    "Hoot",
  ];
  return lines.join("\n");
}

function sourcesLine(p: WeeklyPerformers | null): string {
  const movers = p?.source === "sheet" ? `the PT sheet's "% 1 Week"` : "the app's Monday and Friday closes";
  return `Where this comes from: highlights from the PT sheet's 2025 Time-Weighted Returns tab; top and worst 3 from ${movers}; earnings for holdings from the sheet's Price Targets tab, plus sector bellwethers and the week's largest reporters (worth $10B or more, from Finnhub and Yahoo); market news from the economic calendar; process updates from the fund's semester calendar in Drive.`;
}

/** Hoot's notes on the movers, each with the headline it rests on. Omitted when there are none. */
function whySection(p: WeeklyPerformers | null): string[] {
  if (!p?.why?.length) return [];
  return [heading("Why they moved (Hoot's read of the news, for context, not for the slide)"), ...p.why.map((w) => `${w.ticker}: ${w.text} (${w.source}: ${w.url})`), ""];
}
