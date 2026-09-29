import Link from "next/link";
import { DateTime } from "luxon";
import { isFundWide, listAccessibleTeams } from "@/lib/auth";
import { loadTeamSectors } from "@/lib/attribution/load";
import { listBellwethers, listCalendarHoldingEvents, listHoldingIndustries, listTeamEarnings } from "@/lib/earnings";
import {
  EARNINGS_DEFAULT_LAYOUT,
  LIST_DAYS,
  buildMonthGrid,
  defaultSelectedDay,
  expectationsState,
  filterCalendarEvents,
  kindOf,
  groupByDate,
  inGrid,
  industryOptions,
  parseCalendarQuery,
  toCalendarEvents,
  type CalendarKind,
} from "@/lib/earnings-calendar";
import { NY, todayNY } from "@/lib/providers/calendar";
import { loadScope } from "@/lib/teams";
import { CalendarView, type ReportRow } from "@/components/app/earnings/calendar-view";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The Calendar's Earnings tab: the Fund's reports (and, when ticked under Show, sector bellwethers and economic releases)
 * as a list of the coming weeks, a week or a month. The Fund's own reports are what it opens on. Earnings load here; the
 * releases, when shown, stream in on the client from /api/economic-calendar.
 */
export async function CalendarPage({ slug, sp, defaultShow }: { slug: string; sp: SearchParams; defaultShow: CalendarKind[] }) {
  const scope = await loadScope(slug);
  const { team, user, teamById } = scope;
  const today = todayNY();
  const parsed = parseCalendarQuery(sp, today, defaultShow, EARNINGS_DEFAULT_LAYOUT);
  // Sector and Industry are relative to one team's sectors, so the fund-wide page always shows the Fund calendar.
  const query = team ? parsed : { ...parsed, scope: "fund" as const, industry: undefined };
  const grid = buildMonthGrid(query.month);
  // The grid ends on a Friday; reach through that weekend so the last week is whole. The list runs five weeks from today.
  const listEnd = DateTime.fromISO(today, { zone: NY }).plus({ days: LIST_DAYS - 1 }).toISODate()!;
  const through = [DateTime.fromISO(grid.end, { zone: NY }).plus({ days: 2 }).toISODate()!, listEnd].sort().at(-1)!;
  const from = [grid.start, today].sort()[0];
  const sectors = team ? ((await loadTeamSectors()).get(team.id) ?? []) : [];
  const [rows, holdingEvents, bellwethers, holdingIndustries, accessibleTeams] = await Promise.all([
    listTeamEarnings(scope.teamIds),
    listCalendarHoldingEvents(from, through),
    listBellwethers(),
    team ? listHoldingIndustries(team.id, sectors) : [],
    listAccessibleTeams(user),
  ]);
  const accessibleTeamIds = accessibleTeams.map((t) => t.id);

  const all = toCalendarEvents(holdingEvents, bellwethers).filter((ev) => ev.date >= from && ev.date <= through);
  const events = filterCalendarEvents(all, { view: query.scope, teamId: team?.id ?? "", teamSectors: sectors, industry: query.industry });
  // The week to open on follows what is shown, so a month of bellwethers doesn't pick it for a Fund-only calendar.
  const byDate = groupByDate(events.filter((ev) => query.show.includes(kindOf(ev))));
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
      name: h.companyName ?? h.ticker,
      teamSlug: t?.slug ?? null,
      teamName: t?.name ?? null,
      reportDate: e.reportDate,
      reportHour: e.reportHour,
      dateStatus: e.dateStatus,
      epsEstimate: e.epsEstimate,
      epsCurrency: e.epsCurrency,
      expectations: expectationsState(e),
      status: e.status,
    };
  });

  return (
    <CalendarView
      base={`/t/${scope.slug}/earnings`}
      economicBase={`/t/${scope.slug}/economic-calendar`}
      scopeSlug={scope.slug}
      defaultShow={defaultShow}
      defaultLayout={EARNINGS_DEFAULT_LAYOUT}
      query={query}
      today={today}
      selectedDay={selectedDay}
      canScope={!!team}
      industries={industries}
      events={events}
      accessibleTeamIds={accessibleTeamIds}
      notices={notices}
      reports={reports}
      showTeam={!team}
    />
  );
}
