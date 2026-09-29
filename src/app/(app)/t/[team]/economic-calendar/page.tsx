import type { Metadata } from "next";
import { DateTime } from "luxon";
import { NY, todayNY } from "@/lib/providers/calendar";
import { calendarFactorContext } from "@/lib/risk/factor-context";
import { loadScope } from "@/lib/teams";
import { EconomicView } from "@/components/app/economic-calendar/economic-view";

export const metadata: Metadata = { title: "Economic calendar" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Calendar's Economic releases tab: one week of releases (the week holding `?day=`, this week by default). The
 * releases stream in on the client from /api/economic-calendar and refresh every minute; the earnings are on the other tab.
 */
export default async function EconomicCalendarPage({ params, searchParams }: PageProps<"/t/[team]/economic-calendar">) {
  const [{ team: slug }, sp] = await Promise.all([params, searchParams]);
  const { team, user, slug: scopeSlug } = await loadScope(slug);
  const today = todayNY();
  const raw = Array.isArray(sp.day) ? sp.day[0] : sp.day;
  const day = raw && DAY_RE.test(raw) && DateTime.fromISO(raw, { zone: NY }).isValid ? raw : today;
  return (
    <EconomicView
      base={`/t/${scopeSlug}/economic-calendar`}
      day={day}
      today={today}
      teamSlug={team ? slug : null}
      // Not awaited: the page renders at once and the factor lines stream in when the risk report is ready.
      factorContext={calendarFactorContext(user)}
    />
  );
}
