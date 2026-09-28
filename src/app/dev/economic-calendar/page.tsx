import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarView } from "@/components/app/earnings/calendar-view";
import { EARNINGS_DEFAULT_SHOW, buildMonthGrid, defaultSelectedDay, groupByDate, inGrid, kindOf, parseCalendarQuery, type CalendarEvent } from "@/lib/earnings-calendar";
import { bookExposure, type CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import { calendarPreviewEnabled } from "@/lib/economic-calendar/preview";
import { NY, todayNY } from "@/lib/providers/calendar";
import { isFactorReport } from "@/lib/risk/factors";
import { previewReport } from "@/lib/risk/preview";

export const dynamic = "force-dynamic";

/** Synthetic factor betas for the release lines: ?audience=fund (default), team or label. */
function previewFactorContext(audience: string | undefined): CalendarFactorContext {
  if (audience === "label") return { audience: "label", exposure: null, href: null, basis: null };
  const team = audience === "team";
  const f = previewReport("1y", { team }).factors;
  if (!isFactorReport(f)) return { audience: team ? "team" : "fund", exposure: null, href: null, basis: null };
  return {
    audience: team ? "team" : "fund",
    exposure: bookExposure(team ? "the Tech & media book" : "the book", f.fund),
    href: team ? "/dev/exposure?scope=team#factors" : "/dev/exposure#factors",
    basis: `1 year of synthetic daily returns to ${f.sample.to}`,
  };
}

/** A few synthetic reports on every Tuesday to Thursday of the grid, so the merged calendar has earnings to show. */
function previewEarnings(start: string, end: string): CalendarEvent[] {
  const names = [
    ["NVDA", "NVIDIA", "Tech & media", "information_technology"],
    ["JPM", "JPMorgan Chase", "FIG", "financials"],
    ["UNH", "UnitedHealth", "Healthcare", "health_care"],
  ] as const;
  const out: CalendarEvent[] = [];
  let i = 0;
  for (let d = DateTime.fromISO(start, { zone: NY }); d.toISODate()! <= end; d = d.plus({ days: 1 })) {
    if (d.weekday < 2 || d.weekday > 4) continue;
    const [ticker, name, teamName, sector] = names[i % names.length];
    const date = d.toISODate()!;
    out.push({
      date,
      ticker,
      name,
      kind: "holding",
      sector,
      industry: null,
      reportHour: i % 2 ? "amc" : "bmo",
      dateStatus: i % 3 ? "confirmed" : "estimated",
      epsEstimate: (1 + (i % 5) * 0.37).toFixed(2),
      epsCurrency: "USD",
      earningsId: `preview-${i}`,
      teamId: "preview-team",
      teamSlug: "preview",
      teamName,
      status: "upcoming",
      expectations: (["locked", "draft", "not_started"] as const)[i % 3],
    });
    if (i % 2 === 0)
      out.push({ date, ticker: `BW${i}`, name: `Bellwether ${i}`, kind: "bellwether", sector, industry: null, reportHour: "bmo", dateStatus: "estimated", epsEstimate: "0.94", epsCurrency: "USD", etf: "XLF", weightPct: "3.1" });
    i++;
  }
  return out;
}

export default async function Preview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!calendarPreviewEnabled()) notFound();
  const sp = await searchParams;
  const live = sp.live === "1";
  const audience = typeof sp.audience === "string" ? sp.audience : undefined;
  const today = todayNY();
  // Opens like /t/[team]/earnings: the Fund's reports, with bellwethers and releases under Show (or ?show=).
  const query = { ...parseCalendarQuery(sp, today, EARNINGS_DEFAULT_SHOW), scope: "fund" as const };
  const grid = buildMonthGrid(query.month);
  const events = previewEarnings(grid.start, grid.end);
  const selectedDay = query.day && inGrid(grid, query.day) ? query.day : defaultSelectedDay(grid, groupByDate(events.filter((ev) => query.show.includes(kindOf(ev)))), today);
  return (
    <main className="flex min-h-dvh flex-col bg-background p-6">
      <CalendarView
        base="/dev/economic-calendar"
        defaultShow={[...EARNINGS_DEFAULT_SHOW]}
        query={query}
        today={today}
        selectedDay={selectedDay}
        canScope={false}
        industries={[]}
        events={events}
        accessibleTeamIds={["preview-team"]}
        notices={["Earnings here are synthetic fixtures, not the Fund's."]}
        reports={[]}
        showTeam
        teamSlug={null}
        factorContext={Promise.resolve(previewFactorContext(audience))}
        feedSource={live ? { livePreview: true } : { preview: true }}
        askable={false}
        banner={
          live ? (
            <p role="note" className="border-b bg-band-2 px-5 py-2 text-body text-muted-foreground">
              Local verification view · live calendar feed · app authentication remains required on the main route.
            </p>
          ) : (
            <p role="note" className="border-b bg-caution px-5 py-2 text-body text-caution-foreground">
              <strong className="font-semibold">Development preview · synthetic data.</strong> Dates and values illustrate the interface, not the real economic schedule. Live coverage is not verified.
            </p>
          )
        }
      />
    </main>
  );
}
