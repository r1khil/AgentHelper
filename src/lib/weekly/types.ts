/**
 * Shapes stored in the `weekly_updates` / `weekly_requests` jsonb columns. Pure types plus the
 * empty values, so the schema, the job, and the page all agree on one structure.
 */

/** One line of an agenda section. `day` is a weekday name ("Monday") or null when none was given. */
export type AgendaItem = { day: string | null; text: string };

export type WeeklyAgenda = {
  earnings: AgendaItem[];
  marketNews: AgendaItem[];
  processUpdates: AgendaItem[];
};

/**
 * A figure the execs keep in their price target sheet. `sheet` means the app read it from the sheet (`ref` is the
 * cell, `asOf` the sheet's last edit); `carried` means it was copied from last week's pack as a placeholder and nobody
 * has confirmed it yet; `entered` means an exec typed and saved it.
 */
export type FigureSource = "entered" | "carried" | "sheet";
export type FigureValue = { value: number | null; source: FigureSource; ref?: string; asOf?: string };

export type WeeklyFigures = {
  /** Assets under management, in thousands of dollars. */
  aumK: FigureValue;
  /** Fund year-to-date return, in percent. */
  ytdPct: FigureValue;
  /** S&P 500 total return year-to-date, in percent. */
  benchmarkYtdPct: FigureValue;
};

export type Performer = { ticker: string; name: string; pct: number };

export type WeeklyPerformers = {
  top: Performer[];
  worst: Performer[];
  /** Tickers with no close at one or both ends of the window. */
  missing: string[];
  window: { start: string; end: string };
};

/** Phase 2 placeholder: the YTD chart is still pasted into the deck by hand. */
export type WeeklyChart = { note?: string };

export type SourceStatus = "ok" | "failed" | "held";
export type SourceEntry = { status: SourceStatus; at: string; error?: string; detail?: string };
/** One entry per build step, so a partial pack says plainly which part did not come through. */
export type WeeklySources = Record<string, SourceEntry>;

export const AGENDA_SECTIONS = ["earnings", "marketNews", "processUpdates"] as const;
export type AgendaSection = (typeof AGENDA_SECTIONS)[number];

export const AGENDA_LABELS: Record<AgendaSection, string> = {
  earnings: "Earnings",
  marketNews: "Market News",
  processUpdates: "Process Updates",
};

export function emptyAgenda(): WeeklyAgenda {
  return { earnings: [], marketNews: [], processUpdates: [] };
}

export function emptyFigures(): WeeklyFigures {
  return {
    aumK: { value: null, source: "entered" },
    ytdPct: { value: null, source: "entered" },
    benchmarkYtdPct: { value: null, source: "entered" },
  };
}

export function isAgendaSection(v: string): v is AgendaSection {
  return (AGENDA_SECTIONS as readonly string[]).includes(v);
}
