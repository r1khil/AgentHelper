import { AGENDA_LABELS, AGENDA_SECTIONS, type AgendaItem, type Performer, type WeeklyAgenda, type WeeklyFigures, type WeeklyPerformers } from "./types";
import { deriveRelative } from "./figures";
import { packTitle } from "./weeks";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** "Mon", "monday", "MONDAY" all normalize to "Monday"; anything else is not a weekday. */
export function normalizeWeekday(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/\.$/, "");
  return WEEKDAYS.find((d) => d.toLowerCase() === v || d.toLowerCase().slice(0, 3) === v) ?? null;
}

/** The deck's own percentage style: one decimal, negatives in parentheses. */
export function fmtDeckPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  // Round the magnitude, so -3.05 and 3.05 land on the same digits rather than straddling zero.
  const magnitude = Math.round(Math.abs(n) * 10) / 10;
  const body = `${magnitude.toFixed(1)}%`;
  return n < 0 && magnitude > 0 ? `(${body})` : body;
}

/** The deck's AUM style: thousands of dollars, one decimal, e.g. "$4,646.9k". */
export function fmtAumK(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const body = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return n < 0 ? `($${body}k)` : `$${body}k`;
}

export function performerLine(p: Performer): string {
  return `${p.name} (${p.ticker}): ${fmtDeckPct(p.pct)}`;
}

/**
 * One deck bullet: consecutive items that share a weekday are collapsed, and the weekday is
 * printed once after the last ticker of the run —
 * "Earnings: ANAB (Monday), TCOM, FPS (Tuesday), LEN (Wednesday)".
 */
export function agendaLine(label: string, items: AgendaItem[]): string {
  if (!items.length) return `${label}:`;
  const runs: { day: string | null; texts: string[] }[] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (last && last.day === item.day) last.texts.push(item.text);
    else runs.push({ day: item.day, texts: [item.text] });
  }
  const body = runs
    .map((run) => {
      const joined = run.texts.join(", ");
      return run.day ? `${joined} (${run.day})` : joined;
    })
    .join(", ");
  return `${label}: ${body}`;
}

export function agendaLines(agenda: WeeklyAgenda | null): string[] {
  if (!agenda) return AGENDA_SECTIONS.map((s) => `${AGENDA_LABELS[s]}:`);
  return AGENDA_SECTIONS.map((s) => agendaLine(AGENDA_LABELS[s], agenda[s] ?? []));
}

export function figureLines(figures: WeeklyFigures): string[] {
  const relative = deriveRelative(figures.ytdPct.value, figures.benchmarkYtdPct.value);
  return [
    `AUM: ${fmtAumK(figures.aumK.value)}`,
    `YTD Return: ${fmtDeckPct(figures.ytdPct.value)}`,
    `YTD Relative Return (vs SPXTR): ${fmtDeckPct(relative)}`,
  ];
}

export type PackTextInput = {
  weekEnding: string;
  figures: WeeklyFigures;
  performers: WeeklyPerformers | null;
  agenda: WeeklyAgenda | null;
  lastWeekAgenda: WeeklyAgenda | null;
};

/** The whole pack as plain text, in the deck's order, for the "Copy whole pack" button. */
export function packText(pack: PackTextInput): string {
  const out: string[] = [packTitle(pack.weekEnding), ""];
  out.push("Portfolio Highlights", ...figureLines(pack.figures), "");
  out.push("Top 3 Performers", ...(pack.performers?.top.length ? pack.performers.top.map(performerLine) : ["—"]), "");
  out.push("Worst 3 Performers", ...(pack.performers?.worst.length ? pack.performers.worst.map(performerLine) : ["—"]), "");
  out.push("Last Week's Agenda", ...agendaLines(pack.lastWeekAgenda), "");
  out.push("This Week's Agenda", ...agendaLines(pack.agenda), "");
  out.push("YTD Performance chart: paste from the price target sheet.");
  return out.join("\n");
}

/** Textarea text -> items. "Monday: ANAB" sets the day; a bare line keeps day null. */
export function linesToItems(text: string): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z]{3,9}\.?)\s*[:–—-]\s*(.+)$/);
    const day = m ? normalizeWeekday(m[1]) : null;
    out.push(day ? { day, text: m![2].trim() } : { day: null, text: line });
  }
  return out;
}

/** Items -> textarea text, the inverse of linesToItems for anything it produced. */
export function itemsToLines(items: AgendaItem[]): string {
  return items.map((i) => (i.day ? `${i.day}: ${i.text}` : i.text)).join("\n");
}
