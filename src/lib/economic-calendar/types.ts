export type EconomicEvent = {
  id: string;
  timestamp: string | null;
  date: string;
  time: string;
  tentative: boolean;
  name: string;
  category: string | null;
  period: string | null;
  actual: string | null;
  estimate: string | null;
  /** Who supplied the consensus in `estimate`: the feed's provider, or FXStreet where it filled a gap. */
  estimateSource?: string | null;
  providerForecast?: string | null;
  /** A prediction market's price for the release: kept apart from consensus because it isn't a survey. */
  marketImplied?: {
    value: string;
    /** "median", or for stepped outcomes such as Fed decisions "64% likely". */
    detail: string;
    source: string;
    url: string;
  } | null;
  previous: string | null;
  previousBeforeRevision: string | null;
  importance: 1 | 2 | 3 | null;
  source: string | null;
  sourceUrl?: string;
  unit?: string | null;
  currency?: string | null;
  referenceDate?: string | null;
  updatedAt: string | null;
};
export type CalendarRange = { from: string; to: string };
export type CalendarSourceStatus = {
  name: string;
  url: string;
  status: "ok" | "unavailable";
  count: number;
  error?: string;
};
export type CalendarResult = {
  events: EconomicEvent[];
  sources?: CalendarSourceStatus[];
  coverage?: { status: "partial" | "verified"; message: string };
};
export type CalendarFeed = CalendarRange &
  CalendarResult & {
    provider: string;
    mode: "live" | "demo";
    fetchedAt: string;
    /** Every source failed, so this is the last copy that loaded, as of fetchedAt. */
    stale?: boolean;
  };
export interface EconomicCalendarProvider {
  name: string;
  /** Where a person can see the source, listed when it is unavailable. */
  url: string;
  getEvents(range: CalendarRange): Promise<CalendarResult>;
}
