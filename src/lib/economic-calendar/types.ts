export type EconomicEvent = {
  id: string;
  timestamp: string;
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
  updatedAt: string | null;
};
export type CalendarRange = { from: string; to: string };
export type CalendarFeed = CalendarRange & {
  events: EconomicEvent[];
  provider: string;
  mode: "live" | "demo";
  fetchedAt: string;
};
export interface EconomicCalendarProvider {
  name: string;
  getEvents(range: CalendarRange): Promise<EconomicEvent[]>;
}
