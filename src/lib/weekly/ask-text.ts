import { itemsToLines } from "./format";
import type { AgendaItem } from "./types";
import { agendaWeek, weekEndingLabel, weekRangeLabel } from "./weeks";

export type AskInput = {
  weekEnding: string;
  /** Last week's process updates, quoted back so only the changes need typing. */
  lastWeekProcessUpdates: AgendaItem[];
  packUrl?: string | null;
};

export function askSubject(weekEnding: string): string {
  const { from, to } = agendaWeek(weekEnding);
  return `Process updates for the week of ${weekRangeLabel(from, to)}`;
}

/**
 * The ask. It quotes last week's items and asks for the same "Day: text" shape back; it never
 * proposes wording of its own — the execs own what goes in the deck.
 */
export function askEmailText(input: AskInput): string {
  const { from, to } = agendaWeek(input.weekEnding);
  const previous = input.lastWeekProcessUpdates.length ? itemsToLines(input.lastWeekProcessUpdates) : "(none recorded)";
  const lines = [
    `The weekly pack for the week ended ${weekEndingLabel(input.weekEnding)} is built.`,
    `It still needs the Process Updates for the week of ${weekRangeLabel(from, to)}.`,
    "",
    "Reply to this email with one line per item, in this shape:",
    "",
    "Monday: <what is happening>",
    "Wednesday: <what is happening>",
    "",
    "Last week's process updates, for reference:",
    "",
    previous,
    "",
    "Your reply is filed against this week's pack automatically. Nothing is sent to the fund; you still assemble and send the deck.",
  ];
  if (input.packUrl) lines.push("", `Open the pack: ${input.packUrl}`);
  return lines.join("\n");
}
