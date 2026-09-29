import "server-only";
import { and, asc, between, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { earnings, holdings } from "@/db/schema";
import { getEconomicCalendar } from "@/lib/economic-calendar/service";
import { NY, todayNY } from "@/lib/providers/calendar";
import { fmtDay, fmtTime } from "@/lib/format";

/** One line of "This week": a day, what happens, and when in the day. */
export type WeekItem = { date: string; day: string; text: string; when: string };

const AHEAD_DAYS = 7;
const SHOWN = 6;
const HOUR: Record<string, string> = { bmo: "before the open", amc: "after the close", dmh: "during the session" };

function join(xs: string[]) {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}

/**
 * What lands in the next week: the fund's earnings reports and the big economic releases (importance 3), in date
 * order. The releases come from the calendar feed, which can be down; the earnings still show then.
 */
export async function loadWeek(teamIds: string[]): Promise<{ items: WeekItem[]; releasesUnavailable: boolean }> {
  const today = todayNY();
  const to = DateTime.fromISO(today, { zone: NY }).plus({ days: AHEAD_DAYS }).toISODate()!;
  const [reports, feed] = await Promise.all([
    teamIds.length
      ? db
          .select({ ticker: holdings.ticker, date: earnings.reportDate, hour: earnings.reportHour, dateStatus: earnings.dateStatus })
          .from(earnings)
          .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
          .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active"), eq(earnings.status, "upcoming"), between(earnings.reportDate, today, to)))
          .orderBy(asc(earnings.reportDate))
      : Promise.resolve([]),
    getEconomicCalendar({ from: today, to }).catch(() => null),
  ]);

  const items: (WeekItem & { sort: string })[] = [];
  const groups = new Map<string, { date: string; hour: string; tickers: string[]; estimated: boolean }>();
  for (const r of reports) {
    const key = `${r.date}|${r.hour ?? ""}`;
    const g = groups.get(key) ?? { date: r.date, hour: r.hour ?? "", tickers: [], estimated: true };
    g.tickers.push(r.ticker);
    if (r.dateStatus !== "estimated") g.estimated = false;
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    items.push({ date: g.date, day: fmtDay(g.date), text: `${join(g.tickers)} ${g.tickers.length === 1 ? "reports" : "report"}${g.estimated ? " (est.)" : ""}`, when: HOUR[g.hour] ?? "", sort: `${g.date}|${g.hour === "bmo" ? "0" : "9"}` });
  }
  for (const e of feed?.events ?? []) {
    if (e.importance !== 3 || e.date < today || e.date > to) continue;
    items.push({ date: e.date, day: fmtDay(e.date), text: e.name, when: e.timestamp && !e.tentative ? fmtTime(e.timestamp) : e.tentative ? "Time to be set" : e.time, sort: `${e.date}|${e.timestamp ?? e.time}` });
  }
  items.sort((a, b) => a.sort.localeCompare(b.sort));
  return { items: items.slice(0, SHOWN).map((x) => ({ date: x.date, day: x.day, text: x.text, when: x.when })), releasesUnavailable: feed === null };
}
