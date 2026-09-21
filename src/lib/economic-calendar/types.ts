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
  previous: string | null;
  previousBeforeRevision: string | null;
  importance: 1 | 2 | 3 | null;
  source: string | null;
  sourceUrl?: string;
  unit?: string | null;
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
  };
export interface EconomicCalendarProvider {
  name: string;
  getEvents(range: CalendarRange): Promise<CalendarResult>;
}
