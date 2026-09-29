import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { marketsHref, isDay } from "@/app/(app)/markets/types";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { NY, todayNY } from "@/lib/providers/calendar";

/**
 * The Calendar's Economic releases tab is Markets now, on the same team. A `?day=` in a past week opens Markets' Past
 * view on the five weeks up to that week's Sunday; anything else opens the coming five weeks.
 */
export default async function EconomicCalendarPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ team: slug }, sp] = await Promise.all([params, searchParams]);
  const team = slug === FUND_SCOPE_SLUG ? null : slug;
  const raw = Array.isArray(sp.day) ? sp.day[0] : sp.day;
  const today = todayNY();
  if (isDay(raw) && raw < DateTime.fromISO(today, { zone: NY }).startOf("week").toISODate()!) {
    const sunday = DateTime.fromISO(raw, { zone: NY }).endOf("week").toISODate()!;
    redirect(marketsHref({ team, view: "past", to: sunday < today ? sunday : null }));
  }
  redirect(marketsHref({ team }));
}
