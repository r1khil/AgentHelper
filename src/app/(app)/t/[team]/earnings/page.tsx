import type { Metadata } from "next";
import Link from "next/link";
import { loadScope } from "@/lib/teams";
import type { Team } from "@/db/schema";
import { isFundWide, listAccessibleTeams } from "@/lib/auth";
import { listBellwethers, listCalendarHoldingEvents, listHoldingIndustries, listTeamEarnings } from "@/lib/earnings";
import { buildMonthGrid, defaultSelectedDay, filterCalendarEvents, groupByDate, inGrid, industryOptions, parseCalendarQuery, toCalendarEvents } from "@/lib/earnings-calendar";
import { loadTeamSectors } from "@/lib/attribution/load";
import { fmtDate, fmtMoney } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { EarningsCalendar } from "@/components/app/earnings/earnings-calendar";
import { EarningsDayList } from "@/components/app/earnings/earnings-day-list";
import { EarningsScopeToggle } from "@/components/app/earnings/earnings-scope-toggle";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsPage({ params, searchParams }: PageProps<"/t/[team]/earnings">) {
  const [{ team: slug }, sp] = await Promise.all([params, searchParams]);
  const scope = await loadScope(slug);
  const { team, user, teamById } = scope;
  const today = todayNY();
  const parsed = parseCalendarQuery(sp, today);
  // Sector and Industry are relative to one team's sectors, so the fund-wide page always shows the Fund calendar.
  const query = team ? parsed : { ...parsed, view: "fund" as const, industry: undefined };
  const grid = buildMonthGrid(query.month);
  const sectors = team ? ((await loadTeamSectors()).get(team.id) ?? []) : [];
  const [rows, holdingEvents, bellwethers, holdingIndustries, accessibleTeams] = await Promise.all([
    listTeamEarnings(scope.teamIds),
    listCalendarHoldingEvents(grid.start, grid.end),
    listBellwethers(),
    team ? listHoldingIndustries(team.id, sectors) : [],
    listAccessibleTeams(user),
  ]);
  const accessibleTeamIds = accessibleTeams.map((t) => t.id);
  const base = `/t/${scope.slug}/earnings`;

  const all = toCalendarEvents(holdingEvents, bellwethers).filter((ev) => inGrid(grid, ev.date));
  const events = filterCalendarEvents(all, { view: query.view, teamId: team?.id ?? "", teamSectors: sectors, industry: query.industry });
  const byDate = groupByDate(events);
  const selected = query.day && inGrid(grid, query.day) ? query.day : defaultSelectedDay(grid, byDate, today);
  const industries = industryOptions(holdingIndustries, bellwethers, sectors);
  const unclassifiedOwn = query.view === "industry" ? all.filter((ev) => ev.kind === "holding" && ev.teamId === team?.id && !ev.industry).length : 0;

  const upcoming = rows.filter((r) => r.e.status === "upcoming" && r.e.reportDate >= today).sort((a, b) => (a.e.reportDate < b.e.reportDate ? -1 : 1));
  const past = rows.filter((r) => !(r.e.status === "upcoming" && r.e.reportDate >= today));

  const notices: React.ReactNode[] = [];
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
  if (query.view !== "fund" && sectors.length === 0) {
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
  if (query.view === "industry" && (!query.industry || !industries.includes(query.industry))) notices.push("Choose an industry above to see its reports.");
  if (unclassifiedOwn > 0) notices.push(`${unclassifiedOwn} of this team's holdings ${unclassifiedOwn === 1 ? "has" : "have"} no industry yet, so ${unclassifiedOwn === 1 ? "it is" : "they are"} left out of the Industry view.`);

  return (
    <>
      <PageHeader
        title="Earnings"
        description="Upcoming reports for the Fund's holdings and the names that move each sector. Record your expectations before each report; afterwards the agent gathers the sourced results and you write the reflection."
        actions={team ? <EarningsScopeToggle base={base} query={query} industries={industries} /> : undefined}
      />
      {notices.length > 0 && (
        <div className="mb-4 space-y-1">
          {notices.map((n, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      )}
      <EarningsCalendar base={base} query={query} grid={grid} byDate={byDate} today={today} selected={selected} accessibleTeamIds={accessibleTeamIds} />
      <EarningsDayList date={selected} events={byDate.get(selected) ?? []} accessibleTeamIds={accessibleTeamIds} />
      {rows.length === 0 ? (
        <EmptyState title="No earnings dates yet" hoot="sleepy">Dates are pulled each morning for every holding. An admin can run the morning sweep now from the Admin page.</EmptyState>
      ) : (
        <>
          <Section title="Upcoming" rows={upcoming} teamById={teamById} showTeam={!team} />
          {past.length > 0 && <Section title="Reported" rows={past} teamById={teamById} showTeam={!team} />}
        </>
      )}
    </>
  );
}

function Section({ title, rows, teamById, showTeam }: { title: string; rows: Awaited<ReturnType<typeof listTeamEarnings>>; teamById: Map<string, Team>; showTeam: boolean }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title} <span className="text-muted-foreground">{rows.length}</span></h2>
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                {showTeam && <TableHead>Team</TableHead>}
                <TableHead>Report date</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">EPS est.</TableHead>
                <TableHead>Prep</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ e, h }) => (
                <TableRow key={e.id}>
                  <TableCell><Link href={`/t/${teamById.get(h.teamId)?.slug}/earnings/${e.id}`} className="font-semibold hover:underline">{h.ticker}</Link></TableCell>
                  {showTeam && <TableCell className="text-muted-foreground">{teamById.get(h.teamId)?.name}</TableCell>}
                  <TableCell className="tnum">{fmtDate(e.reportDate)}{e.reportHour ? <span className="ml-1 text-xs text-muted-foreground">{e.reportHour.toUpperCase()}</span> : null}</TableCell>
                  <TableCell><Badge variant="outline">{e.dateStatus}</Badge></TableCell>
                  <TableCell className="tnum text-right">{e.epsEstimate ? fmtMoney(e.epsEstimate) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.preLockedAt ? "locked" : e.expectations ? "draft" : "not started"}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
