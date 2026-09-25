import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";
import { rangeDays } from "./dates";
import type { CalendarFeed, CalendarRange } from "./types";

/** Synthetic interface fixtures only. Never imported by the live calendar service. */
export function previewCalendar(range: CalendarRange): CalendarFeed {
  const names = [
    [
      "Empire State Manufacturing Index",
      "Industrial Production MoM",
      "Capacity Utilization",
      "Fed Official Speech",
    ],
    [
      "Retail Sales MoM",
      "Import Prices MoM",
      "Core Inflation Rate MoM",
      "Business Inventories",
    ],
    [
      "MBA Mortgage Applications",
      "Housing Starts",
      "Fed Interest Rate Decision",
      "Building Permits",
      "EIA Crude Oil Stocks Change",
    ],
    [
      "Initial Jobless Claims",
      "Continuing Jobless Claims",
      "Philadelphia Fed Manufacturing Index",
      "Existing Home Sales",
      "Kansas Fed Manufacturing Index",
      "Fed Official Speech",
    ],
    [
      "Durable Goods Orders MoM",
      "S&P Global Manufacturing PMI Flash",
      "Non Farm Payrolls",
      "Michigan Consumer Sentiment Final",
      "New Home Sales",
    ],
  ];
  return {
    ...range,
    provider: "Synthetic preview",
    mode: "demo",
    fetchedAt: new Date().toISOString(),
    events: rangeDays(range).flatMap((day) => {
      const index = DateTime.fromISO(day).weekday - 1;
      return (names[index] ?? []).map((name, i) => {
        const timestamp = DateTime.fromISO(day, { zone: NY })
          .set({ hour: 8 + i, minute: 30 })
          .toUTC()
          .toISO()!;
        const speech = /Speech|Conference/.test(name);
        return {
          id: `demo-${day}-${i}`,
          timestamp,
          date: day,
          time: DateTime.fromISO(timestamp).setZone(NY).toFormat("h:mm a"),
          tentative: i === 5,
          name,
          category: null,
          period: speech ? null : "Sample period",
          actual:
            Date.parse(timestamp) <= Date.now() && !speech ? "0.3%" : null,
          estimate: speech ? null : "0.2%",
          previous: speech ? null : "0.1%",
          previousBeforeRevision: i === 0 ? "0.0%" : null,
          importance: ((i % 3) + 1) as 1 | 2 | 3,
          source: "Synthetic development fixture",
          updatedAt: null,
        };
      });
    }),
  };
}
export function calendarPreviewEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ECONOMIC_CALENDAR_PREVIEW === "1"
  );
}
