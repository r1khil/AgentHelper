import type { PackStatus } from "@/lib/weekly/status";
import type { SourceEntry, WeeklyAgenda, WeeklyFigures, WeeklyPerformers, WeeklySources } from "@/lib/weekly/types";

/** The Sunday email as it would go out now, and what happened to it. */
export type EmailView = {
  to: string | null;
  cc: string[];
  /** Test accounts on the list, which are never emailed. */
  skipped: string[];
  /** The signed-in exec's address, for "Send a copy to me". */
  me: string;
  subject: string;
  text: string;
  record: SourceEntry | null;
  /** First names by lowercased address, for "to Aadi, Saad in CC". */
  names: Record<string, string>;
  /** Full names by lowercased address, for the Send again confirmation. */
  fullNames: Record<string, string>;
};

/** One row of the packs list. */
export type PackListItem = {
  weekEnding: string;
  /** Stored: "sent" once an exec marks it sent, which locks it. */
  status: "draft" | "sent";
  /** What the page calls it (lib/weekly/status): Draft, Scheduled, Sent or Failed. */
  state: PackStatus;
  builtAt: string | null;
  sentAt: string | null;
  /** When the Sunday email went out for this week, if it did. */
  emailedAt: string | null;
  /** The Sunday list is paused (only test accounts on it), so the email will not go out on its own. */
  listPaused: boolean;
};

/** Headline figures for the week the pack reports on. Returns are fractions (0.0192 = 1.92%). */
export type WeekStats = {
  fund: number | null;
  spx: number | null;
  window: { start: string; end: string };
};

export type WeeklyPackProps = {
  weekEnding: string;
  agendaRange: { from: string; to: string };
  /** Stored: "sent" once an exec marks it sent, which locks it. */
  status: "draft" | "sent";
  /** What the page calls it (lib/weekly/status): Draft, Scheduled, Sent or Failed. */
  state: PackStatus;
  figures: WeeklyFigures;
  performers: WeeklyPerformers | null;
  agenda: WeeklyAgenda;
  lastWeekAgenda: WeeklyAgenda;
  sources: WeeklySources;
  email: EmailView | null;
  builtAt: string | null;
  editedAt: string | null;
  sentAt: string | null;
  stats: WeekStats;
  /** Team name by upper-case ticker, for "Company · Team". */
  teamByTicker: Record<string, string>;
  /** "Consumer Discretionary bellwether" by upper-case ticker. */
  bellwetherByTicker: Record<string, string>;
};
