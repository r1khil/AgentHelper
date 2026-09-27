import Link from "next/link";
import { DateTime } from "luxon";
import { isFundWide, listAccessibleTeams } from "@/lib/auth";
import { loadTeamSectors } from "@/lib/attribution/load";
import { listBellwethers, listCalendarHoldingEvents, listHoldingIndustries, listTeamEarnings } from "@/lib/earnings";
import {
  buildMonthGrid,
  defaultSelectedDay,
  expectationsState,
  filterCalendarEvents,
  groupByDate,
  inGrid,
  industryOptions,
  parseCalendarQuery,
  toCalendarEvents,
  type CalendarKind,
} from "@/lib/earnings-calendar";
import { listTeamHoldings } from "@/lib/holdings";
import { NY, todayNY } from "@/lib/providers/calendar";
import { calendarFactorContext } from "@/lib/risk/factor-context";
import { loadScope } from "@/lib/teams";
import { CalendarView, type ReportRow } from "@/components/app/earnings/calendar-view";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The Calendar: the Fund's and bellwethers' earnings merged with the economic releases, one week at a time.
 * /t/[team]/earnings shows everything; /t/[team]/economic-calendar is the same page with only the releases shown.
 * Earnings load here; the releases stream in on the client from /api/economic-calendar and refresh every minute.
 */
export async function CalendarPage({ slug, sp, route, defaultShow }: { slug: string; sp: SearchParams; route: "earnings" | "economic-calendar"; defaultShow: CalendarKind[] }) {
  const scope = await loadScope(slug);
  const { team, user, teamById } = scope;
  const today = todayNY();
  const parsed = parseCalendarQuery(sp, today, defaultShow);
  // Sector and Industry are relative to one team's sectors, so the fund-wide page always shows the Fund calendar.
  const query = team ? parsed : { ...parsed, scope: "fund" as const, industry: undefined };
  const grid = buildMonthGrid(query.month);
  // The grid ends on a Friday; reach through that weekend so the last week is whole.
  const through = DateTime.fromISO(grid.end, { zone: NY }).plus({ days: 2 }).toISODate()!;
  const sectors = team ? ((await loadTeamSectors()).get(team.id) ?? []) : [];
  const [rows, holdingEvents, bellwethers, holdingIndustries, accessibleTeams] = await Promise.all([
    listTeamEarnings(scope.teamIds),
    listCalendarHoldingEvents(grid.start, through),
    listBellwethers(),
    team ? listHoldingIndustries(team.id, sectors) : [],
    listAccessibleTeams(user),
  ]);
  const accessibleTeamIds = accessibleTeams.map((t) => t.id);
  const owners = await listTeamHoldings(accessibleTeamIds, "all");
  const ownerNames: Record<string, string> = {};
  for (const o of owners) if (o.h.ownerId && o.ownerName) ownerNames[o.h.ownerId] = o.ownerName;

  const all = toCalendarEvents(holdingEvents, bellwethers).filter((ev) => ev.date >= grid.start && ev.date <= through);
  const events = filterCalendarEvents(all, { view: query.scope, teamId: team?.id ?? "", teamSectors: sectors, industry: query.industry });
  const byDate = groupByDate(events);
  const selectedDay = query.day && inGrid(grid, query.day) ? query.day : defaultSelectedDay(grid, byDate, today);
  const industries = industryOptions(holdingIndustries, bellwethers, sectors);
  const unclassifiedOwn = query.scope === "industry" ? all.filter((ev) => ev.kind === "holding" && ev.teamId === team?.id && !ev.industry).length : 0;

  const notices: React.ReactNode[] = [];
  if (rows.length === 0) notices.push("No earnings dates yet. Dates are pulled each morning for every holding; an admin can run the morning sweep now from the Admin page.");
  if (bellwethers.length === 0) {
    notices.push(
      <>
        Sector bellwethers appear after the next morning sweep.{" "}
        {isFundWide(user) && (
          <Link href="/admin" className="underline">
            Run it now from the Admin page.
          </Link>
        )}
      </>,
    );
  }
  if (query.scope !== "fund" && sectors.length === 0) {
    notices.push(
      <>
        No GICS sectors are assigned to this team, so only its own holdings are shown.{" "}
        {isFundWide(user) && (
          <Link href="/attribution/ledger?tab=securities" className="underline">
            Assign sectors on the ledger.
          </Link>
        )}
      </>,
    );
  }
  if (query.scope === "industry" && (!query.industry || !industries.includes(query.industry))) notices.push("Choose an industry above to see its reports.");
  if (unclassifiedOwn > 0) notices.push(`${unclassifiedOwn} of this team's holdings ${unclassifiedOwn === 1 ? "has" : "have"} no industry yet, so ${unclassifiedOwn === 1 ? "it is" : "they are"} left out of the Industry view.`);

  const reports: ReportRow[] = rows.map(({ e, h }) => {
    const t = teamById.get(h.teamId);
    return {
      id: e.id,
      ticker: h.ticker,
      teamSlug: t?.slug ?? null,
      teamName: t?.name ?? null,
      reportDate: e.reportDate,
      reportHour: e.reportHour,
      dateStatus: e.dateStatus,
      epsEstimate: e.epsEstimate,
      expectations: expectationsState(e),
      status: e.status,
    };
  });

  return (
    <CalendarView
      base={`/t/${scope.slug}/${route}`}
      defaultShow={defaultShow}
      query={query}
      today={today}
      selectedDay={selectedDay}
      canScope={!!team}
      industries={industries}
      events={events}
      ownerNames={ownerNames}
      accessibleTeamIds={accessibleTeamIds}
      notices={notices}
      reports={reports}
      showTeam={!team}
      teamSlug={slug}
      // Not awaited: the calendar renders at once and the factor lines stream in when the risk report is ready.
      factorContext={calendarFactorContext(user)}
    />
  );
}
